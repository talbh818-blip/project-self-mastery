// ============================================================================
// VisionDailyStrip — daily journaling for a weekly vision (shared desktop+mobile)
// ----------------------------------------------------------------------------
// A single full-width row of the week's seven days — "א׳ · 27 | ב׳ · 28 …"
// (Sun→Sat, RTL) — with the chosen day's own writing surface right below it.
// The surface is ALWAYS open: it lands on today (or, for a past week, its last
// day), and tapping another day switches to it. Marks on each chip:
//   • forest "written" dot (to the RIGHT of the weekday) = that day has a vision
//     — same language as the weekly / monthly / yearly layers; live as you type.
//   • TODAY sits on a very light green chip so it's always easy to spot.
//
// The surrounding card (its padding, width and slightly-darker tint) is owned by
// the PARENT (VisionEditorDesktop / VisionEditor) so the writing lines up with
// the weekly vision above it in each layout. Each day is a real `scope:'daily'`
// entry, so daily visions written elsewhere show up here automatically.
//
// The embedded editor composes useVisionEntry('daily', dayKey) + the shared
// Tiptap engine and reports itself UP (onDailyRegister / onDailyFocus) so the
// one formatting toolbar follows focus between the weekly and daily surfaces.
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

/** What the shared formatting toolbar needs to drive whichever editor is focused. */
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

// The drawer's open/closed choice is remembered per-user (across weeks and
// visits). null = no stored choice yet → default open.
const DRAWER_LS_PREFIX = 'vision-daily-drawer:';
function readSavedDrawerOpen(userId: string | null): boolean | null {
  if (!userId) return null;
  try {
    const v = localStorage.getItem(`${DRAWER_LS_PREFIX}${userId}`);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // ignore
  }
  return null;
}

export function VisionDailyStrip({
  userId,
  weekKey,
  onDailyRegister,
  onDailyFocus,
}: {
  userId: string | null;
  weekKey: string;
  /** Register / clear the daily editor as the toolbar's focus target. */
  onDailyRegister: (target: DailyToolbarTarget | null) => void;
  /** The daily surface gained focus → the toolbar should drive it. */
  onDailyFocus: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const todayKey = getDayKey(today);

  const days = useMemo(() => weekDays(weekKey), [weekKey]);
  const dayKeys = useMemo(() => days.map((d) => d.key), [days]);

  // A day is ALWAYS open: today for the current week, else the latest non-future
  // day of the week (a past week opens on its Saturday); a fully-future week has
  // nothing to open.
  const defaultSelected = useMemo(() => {
    if (dayKeys.includes(todayKey)) return todayKey;
    for (let i = days.length - 1; i >= 0; i--) {
      if (!isFuturePeriod('daily', days[i].key, today)) return days[i].key;
    }
    return null;
  }, [days, dayKeys, todayKey, today]);
  // `activeDay` is the day the editor holds; `open` is whether its drawer is
  // expanded. A fresh week lands on its default day, open. Tapping the open day
  // again collapses the drawer (tap once more to reopen); tapping another day
  // opens that one.
  const [activeDay, setActiveDay] = useState<string | null>(defaultSelected);
  const [open, setOpen] = useState<boolean>(() =>
    defaultSelected === null ? false : readSavedDrawerOpen(userId) ?? true,
  );
  // On a week change (or once auth resolves), re-apply the remembered choice:
  // a day is active, and the drawer opens the way the user last left it.
  useEffect(() => {
    setActiveDay(defaultSelected);
    setOpen(
      defaultSelected === null ? false : readSavedDrawerOpen(userId) ?? true,
    );
  }, [defaultSelected, userId]);

  const setOpenPersist = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (userId) {
        try {
          localStorage.setItem(`${DRAWER_LS_PREFIX}${userId}`, next ? '1' : '0');
        } catch {
          // ignore
        }
      }
    },
    [userId],
  );

  const toggleDay = useCallback(
    (key: string) => {
      if (activeDay === key) {
        setOpenPersist(!open); // same day → open/close (remembered)
      } else {
        setActiveDay(key); // different day → switch and open
        setOpenPersist(true);
      }
    },
    [activeDay, open, setOpenPersist],
  );

  // Which of the seven days already have a written daily vision → green dot.
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

  const activeFuture =
    activeDay !== null && isFuturePeriod('daily', activeDay, today);
  const drawerOpen = open && activeDay !== null && !activeFuture;

  return (
    <div dir="rtl">
      {/* Day chips — full width, one line each ("א׳ · 27"). Sunday is rightmost. */}
      <div className="flex gap-1.5">
        {days.map((d) => {
          const isFuture = isFuturePeriod('daily', d.key, today);
          const isToday = d.key === todayKey;
          const isSel = drawerOpen && d.key === activeDay;
          const hasContent = written.has(d.key);
          return (
            <button
              key={d.key}
              type="button"
              disabled={isFuture}
              onClick={() => toggleDay(d.key)}
              aria-pressed={isSel}
              // TODAY → a very light green chip. The selected (non-today) day
              // gets a soft neutral lift; the rest are greyed-out white.
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium tabular-nums transition-colors ${
                isFuture
                  ? 'text-ink-100/20 cursor-default'
                  : isToday
                    ? 'bg-forest-700/15 text-ink-100 hover:bg-forest-700/25'
                    : isSel
                      ? 'bg-surface-raised text-ink-100'
                      : 'text-ink-100/45 hover:text-ink-100 hover:bg-surface-raised/40'
              }`}
            >
              {/* "written" dot — to the RIGHT of the weekday (RTL start), same
                  forest language as the weekly / monthly / yearly layers. */}
              {hasContent && (
                <span
                  aria-hidden
                  className="shrink-0 w-[5px] h-[5px] rounded-full bg-forest-700 ring-2 ring-forest-700/20"
                />
              )}
              <span>
                {weekdayShort(d.date.getDay())} · {d.date.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* The open day's writing surface — a drawer that slides open/closed
          (grid-rows 0fr↔1fr animates the real height; the inner wrapper clips
          during the fold). The editor stays mounted while a day is active so
          the close animation has content to collapse. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: drawerOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          {activeDay && !activeFuture && userId ? (
            <DailyEditor
              key={activeDay}
              dayKey={activeDay}
              active={drawerOpen}
              onWrittenChange={markWritten}
              onRegister={onDailyRegister}
              onFocus={onDailyFocus}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── The per-day editor — plain; the shared toolbar drives it on focus. ───────

function DailyEditor({
  dayKey,
  active,
  onWrittenChange,
  onRegister,
  onFocus,
}: {
  dayKey: string;
  /** Whether the drawer is open — only then does the toolbar target this. */
  active: boolean;
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

  // Make this editor the toolbar's target while the drawer is OPEN; clear it
  // when closed (collapsed but still mounted) or on unmount, so the toolbar
  // falls back to the weekly editor.
  useEffect(() => {
    if (!editor || !active) {
      onRegister(null);
      return;
    }
    onRegister({ editor, uploadAndInsert, uploadingCount });
    return () => onRegister(null);
  }, [editor, active, uploadAndInsert, uploadingCount, onRegister]);

  // Tell the parent when focus lands here so the toolbar switches target.
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
      <div className="mt-3 pt-3 border-t border-surface-border/60 py-6">
        <CompassLoader size="sm" />
      </div>
    );
  }

  // A hairline separates the day picker from the writing; the surrounding
  // (slightly darker) card and the matching width are provided by the parent.
  return (
    <div className="mt-3 pt-3 border-t border-surface-border/60">
      <EditorContent editor={editor} className="vision-daily-write" />
    </div>
  );
}
