// ============================================================================
// VisionDailyStrip — the daily-journaling row at the BOTTOM of a weekly vision.
// ----------------------------------------------------------------------------
// Minimal by design: under the weekly vision's writing (desktop, Journaling on)
// sits a single full-width row of the week's seven days — "א׳ · 27 | ב׳ · 28 …"
// (Sun→Sat, RTL). Picking a day reveals its OWN writing surface right below,
// styled EXACTLY like the weekly writing above it (same width, same plain
// surface) — no card, no header, no save label, no second toolbar. The ONE
// toolbar at the top of the page follows focus: while the daily surface is
// focused it formats THAT editor (see VisionEditorDesktop's target plumbing).
//
// A white dot marks days that already have a written daily vision (live as you
// type). Future days are inert. Each day is a real `scope:'daily'` entry, so
// old daily visions written elsewhere show up here automatically.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { CompassLoader } from '../../components/CompassLoader';
import { useVisionTiptapEditor } from './useVisionTiptapEditor';
import { useVisionEntry } from './useVisionEntry';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import { VISION_PLACEHOLDERS } from './useVisionController';
import {
  getDayKey,
  isFuturePeriod,
  parsePeriodStart,
  weekdayShort,
} from './period';

/** What the shared top toolbar needs to drive whichever editor is focused. */
export type DailyToolbarTarget = {
  editor: Editor;
  uploadAndInsert: (file: File) => void | Promise<void>;
  uploadingCount: number;
};

type DayInfo = { key: string; date: Date };

/** The seven days (Sun→Sat) of the week a weekly period_key opens. */
function weekDays(weekKey: string): DayInfo[] {
  const start = parsePeriodStart('weekly', weekKey);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: getDayKey(d), date: d };
  });
}

export function VisionDailyStrip({
  userId,
  weekKey,
  onDailyRegister,
  onDailyFocus,
}: {
  userId: string | null;
  weekKey: string;
  /** Register / clear the daily editor as the top toolbar's focus target. */
  onDailyRegister: (target: DailyToolbarTarget | null) => void;
  /** The daily surface gained focus → the top toolbar should drive it. */
  onDailyFocus: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const todayKey = getDayKey(today);

  const days = useMemo(() => weekDays(weekKey), [weekKey]);
  const dayKeys = useMemo(() => days.map((d) => d.key), [days]);

  // Nothing opens by default — the day's writing surface appears only when a
  // day is tapped (a drop-down feel). Switching weeks closes it again.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [weekKey]);

  // Which of the seven days already have a written daily vision → white dot.
  const [written, setWritten] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchVisionRowMeta(userId, dayKeys)
      .then((rows) => {
        if (cancelled) return;
        const next = new Set<string>();
        for (const r of rows) {
          if (r.scope === 'daily' && !isVisionContentEmpty(r.content)) {
            next.add(r.period_key);
          }
        }
        setWritten(next);
      })
      .catch((err) =>
        console.error('[vision] daily-strip meta fetch failed', err),
      );
    return () => {
      cancelled = true;
    };
  }, [userId, dayKeys]);

  // Keep the dot in sync live as the open day is written / cleared.
  const markWritten = useCallback((dayKey: string, hasContent: boolean) => {
    setWritten((prev) => {
      if (prev.has(dayKey) === hasContent) return prev;
      const next = new Set(prev);
      if (hasContent) next.add(dayKey);
      else next.delete(dayKey);
      return next;
    });
  }, []);

  const selectedFuture =
    selected !== null && isFuturePeriod('daily', selected, today);

  return (
    <div dir="rtl" className="mt-6 pt-4 border-t border-surface-border">
      {/* Day chips — full width, one line each ("א׳ · 27"). Sunday is rightmost. */}
      <div className="flex gap-1.5">
        {days.map((d) => {
          const isFuture = isFuturePeriod('daily', d.key, today);
          const isToday = d.key === todayKey;
          const isSel = d.key === selected;
          const hasContent = written.has(d.key);
          return (
            <button
              key={d.key}
              type="button"
              disabled={isFuture}
              onClick={() => setSelected(d.key)}
              aria-pressed={isSel}
              // White days. The selected one stays white on a soft, neutral
              // lift (no green); the rest are greyed-out white; future greyer.
              className={`relative flex-1 inline-flex items-center justify-center py-1.5 rounded-lg text-[12px] font-medium tabular-nums transition-colors ${
                isSel
                  ? 'bg-surface-raised text-ink-100'
                  : isFuture
                    ? 'text-ink-100/20 cursor-default'
                    : 'text-ink-100/45 hover:text-ink-100 hover:bg-surface-raised/40'
              }`}
            >
              {hasContent && (
                <span
                  aria-hidden
                  className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-white"
                />
              )}
              {/* Subtle green marker so "today" is always easy to spot. */}
              {isToday && (
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-forest-500"
                />
              )}
              {weekdayShort(d.date.getDay())} · {d.date.getDate()}
            </button>
          );
        })}
      </div>

      {/* The selected day's own writing surface — appears only on tap. */}
      {selected && !selectedFuture && userId ? (
        <DailyEditor
          key={selected}
          dayKey={selected}
          onWrittenChange={markWritten}
          onRegister={onDailyRegister}
          onFocus={onDailyFocus}
        />
      ) : null}
    </div>
  );
}

// ─── The per-day editor — plain, chrome-less; the top toolbar drives it. ──────

function DailyEditor({
  dayKey,
  onWrittenChange,
  onRegister,
  onFocus,
}: {
  dayKey: string;
  onWrittenChange: (dayKey: string, hasContent: boolean) => void;
  onRegister: (target: DailyToolbarTarget | null) => void;
  onFocus: () => void;
}) {
  const { entry, loading, contentVersion, scheduleSave } = useVisionEntry(
    'daily',
    dayKey,
  );

  const handleChange = useCallback(
    (json: unknown) => {
      scheduleSave(json);
      onWrittenChange(dayKey, !isVisionContentEmpty(json));
    },
    [scheduleSave, onWrittenChange, dayKey],
  );

  const { editor, uploadAndInsert, uploadingCount } = useVisionTiptapEditor({
    initialContent: entry?.content ?? null,
    resetKey: `daily:${dayKey}:${contentVersion}`,
    placeholder: VISION_PLACEHOLDERS.daily,
    onChange: handleChange,
  });

  // Make this editor the top toolbar's target while it exists; clear on unmount.
  useEffect(() => {
    if (!editor) {
      onRegister(null);
      return;
    }
    onRegister({ editor, uploadAndInsert, uploadingCount });
    return () => onRegister(null);
  }, [editor, uploadAndInsert, uploadingCount, onRegister]);

  // Tell the parent when focus lands here so the top toolbar switches target.
  useEffect(() => {
    if (!editor) return;
    const f = () => onFocus();
    editor.on('focus', f);
    return () => {
      editor.off('focus', f);
    };
  }, [editor, onFocus]);

  if (loading || !editor) {
    return (
      <div className="py-8">
        <CompassLoader size="sm" />
      </div>
    );
  }

  // A hair darker than the weekly page card so the two surfaces read apart.
  // -mx-3 lets the tint extend slightly past the text while px-3 keeps the
  // writing itself at the SAME width as the weekly vision above.
  return (
    <div className="mt-2 -mx-3 rounded-xl bg-surface-base/60 px-3 py-2">
      <EditorContent editor={editor} className="vision-daily-write" />
    </div>
  );
}
