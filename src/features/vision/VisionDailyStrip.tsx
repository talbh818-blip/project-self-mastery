// ============================================================================
// VisionDailyStrip — the daily-journaling row at the BOTTOM of a weekly vision.
// ----------------------------------------------------------------------------
// Shown under the weekly vision's writing (desktop, when the Journaling feature
// is on). A compact row of the week's seven days (Sunday → Saturday, RTL):
// picking a day opens its OWN small writing surface right below — a real daily
// vision entry (scope 'daily'), with the same engine, toolbar and auto-save as
// the main editor. A WHITE dot marks days that already have a written vision
// (live — it appears/vanishes as you type), and future days are inert.
//
// This is a SECOND, independent editor living alongside the weekly one: it
// composes useVisionEntry('daily', dayKey) + the shared Tiptap engine, so its
// load/save/▸history all behave exactly like the main vision. The weekly editor
// above is untouched.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { CompassLoader } from '../../components/CompassLoader';
import { VisionToolbar } from './VisionToolbar';
import { useVisionTiptapEditor } from './useVisionTiptapEditor';
import { useVisionEntry, type SaveStatus } from './useVisionEntry';
import { fetchVisionRowMeta } from './queries';
import { isVisionContentEmpty } from './content';
import { VISION_PLACEHOLDERS } from './useVisionController';
import {
  getDayKey,
  isFuturePeriod,
  parsePeriodStart,
  weekdayName,
} from './period';

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
}: {
  userId: string | null;
  weekKey: string;
}) {
  const today = useMemo(() => new Date(), []);
  const todayKey = getDayKey(today);

  const days = useMemo(() => weekDays(weekKey), [weekKey]);
  const dayKeys = useMemo(() => days.map((d) => d.key), [days]);

  // Default: open today's day when this week contains it; otherwise no day is
  // open until one is picked (past/future weeks start empty).
  const defaultSelected = useMemo(
    () => (dayKeys.includes(todayKey) ? todayKey : null),
    [dayKeys, todayKey],
  );
  const [selected, setSelected] = useState<string | null>(defaultSelected);
  // Re-apply the default whenever the week changes (defaultSelected only moves
  // when the day set does), so navigating weeks lands on today / clears.
  useEffect(() => setSelected(defaultSelected), [defaultSelected]);

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
          // A daily key shares the weekly shape (YYYY-MM-DD); pin the scope.
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
      {/* Label */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <NotebookPen size={15} className="text-forest-700 shrink-0" />
        <span className="text-[13px] font-semibold text-ink-100">חזון יומי</span>
        <span className="text-[12px] text-ink-500">· בחר יום לכתיבה</span>
      </div>

      {/* Day chips — Sunday → Saturday (RTL: Sunday is rightmost). */}
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
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors ${
                isSel
                  ? 'bg-forest-700 text-on-accent'
                  : isFuture
                    ? 'bg-surface-raised/40 text-ink-500 opacity-50 cursor-default'
                    : isToday
                      ? 'bg-forest-700/15 text-ink-100 hover:bg-forest-700/25'
                      : 'bg-surface-raised/50 text-ink-300 hover:text-ink-100 hover:bg-surface-raised'
              }`}
            >
              {hasContent && (
                <span
                  aria-hidden
                  className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-white"
                />
              )}
              <span
                className={`text-[11px] leading-none ${isSel ? 'text-on-accent/75' : ''}`}
              >
                {weekdayName(d.date.getDay())}
              </span>
              <span className="text-[13px] font-semibold leading-none tabular-nums">
                {d.date.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* The selected day's own writing surface. */}
      {selected && !selectedFuture && userId ? (
        <DailyEditor
          key={selected}
          userId={userId}
          dayKey={selected}
          onWrittenChange={markWritten}
        />
      ) : selected === null ? (
        <p className="mt-3 text-center text-[12px] text-ink-500 py-4">
          בחר יום כדי לכתוב חזון יומי.
        </p>
      ) : null}
    </div>
  );
}

// ─── The per-day editor ───────────────────────────────────────────────────────

function DailyEditor({
  userId,
  dayKey,
  onWrittenChange,
}: {
  userId: string;
  dayKey: string;
  onWrittenChange: (dayKey: string, hasContent: boolean) => void;
}) {
  const { entry, loading, status, contentVersion, scheduleSave } = useVisionEntry(
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

  const date = parsePeriodStart('daily', dayKey);
  const title = `יום ${weekdayName(date.getDay())} · ${date.getDate()}.${date.getMonth() + 1}`;

  return (
    <div className="mt-3 rounded-xl border border-surface-border bg-surface-base overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-surface-border">
        <span className="text-[13px] font-semibold text-ink-100">{title}</span>
        <SaveLabel status={status} />
      </div>

      {loading || !editor ? (
        <div className="py-8">
          <CompassLoader size="sm" />
        </div>
      ) : (
        <>
          <div className="px-2 pt-2">
            <VisionToolbar
              editor={editor}
              onPickImage={uploadAndInsert}
              uploadingCount={uploadingCount}
              canUpload={!!userId}
              fitWidth={false}
              popoverPlacement="up"
            />
          </div>
          <div className="vision-editor vision-daily-editor px-3 pb-3 pt-2">
            <EditorContent editor={editor} />
          </div>
        </>
      )}
    </div>
  );
}

function SaveLabel({ status }: { status: SaveStatus }) {
  if (status === 'pending' || status === 'saving') {
    return <span className="text-[11px] text-ink-500">שומר…</span>;
  }
  if (status === 'saved') {
    return <span className="text-[11px] text-forest-700">נשמר</span>;
  }
  if (status === 'error') {
    return <span className="text-[11px] text-red-400">שגיאה בשמירה</span>;
  }
  return null;
}
