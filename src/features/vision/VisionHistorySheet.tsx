// ============================================================================
// VisionHistorySheet — restore a previous version of a vision.
// ----------------------------------------------------------------------------
// Lists the locally-kept non-empty snapshots (newest first) with a timestamp
// and a text preview. Picking one restores it into the editor. This is the
// user-facing half of the safety net (see visionHistory.ts): because the
// history lives in localStorage, an accidentally-cleared vision can be
// brought back even after a refresh.
// ============================================================================
import { useMemo } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { visionPreviewText } from './content';
import { getHistory } from './visionHistory';
import type { VisionScope } from './period';

type Props = {
  open: boolean;
  userId: string | null;
  scope: VisionScope;
  periodKey: string;
  onRestore: (content: unknown) => void;
  onClose: () => void;
};

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const date = `${d.getDate()}.${d.getMonth() + 1}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
  return `${date} · ${time}`;
}

export function VisionHistorySheet({
  open,
  userId,
  scope,
  periodKey,
  onRestore,
  onClose,
}: Props) {
  // Read once per open (the key set is stable while the sheet is shown).
  const snapshots = useMemo(
    () => (open ? getHistory(userId, scope, periodKey) : []),
    [open, userId, scope, periodKey],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="גרסאות קודמות של החזון"
    >
      <div
        dir="rtl"
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col animate-modal-rise-in overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-ink-300 hover:bg-surface-raised hover:text-ink-100"
          >
            <X size={18} />
          </button>
          <span className="text-sm font-semibold text-ink-100">גרסאות קודמות</span>
          <span className="w-9" aria-hidden />
        </div>

        {/* List */}
        <div className="overflow-y-auto themed-scroll px-3 py-3 space-y-2">
          {snapshots.length === 0 ? (
            <p className="text-center text-[12px] text-ink-300 py-8">
              אין עדיין גרסאות שמורות לחזון הזה
            </p>
          ) : (
            snapshots.map((snap, i) => {
              const preview = visionPreviewText(snap.content, 220);
              return (
                <div
                  key={`${snap.savedAt}-${i}`}
                  className="rounded-2xl bg-surface-raised p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] text-ink-300 tabular-nums" dir="ltr">
                      {formatWhen(snap.savedAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onRestore(snap.content);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-forest-700 text-on-accent hover:bg-forest-600 transition-colors"
                    >
                      <RotateCcw size={12} />
                      שחזר
                    </button>
                  </div>
                  <p className="text-[12px] leading-relaxed text-ink-300 line-clamp-4">
                    {preview || '—'}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
