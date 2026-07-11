// ============================================================================
// VisionQuestionSettingsSheet — the user's own guided-writing questions.
// ----------------------------------------------------------------------------
// Opened from the gear next to the "+ כתיבה מודרכת" button. FULL-CONTROL model:
// per scope (שנתי / חודשי / שבועי, plus יומי when the Journaling feature is on)
// the user has ONE editable list — add / edit / delete freely
// (vision_user_questions, RLS owner-only — personal content, nobody else reads
// it). On first open the list is SEEDED from the shared defaults
// (seedDefaultQuestionsIfNeeded), so the user starts with the built-in
// questions and owns them from there. There's no "only my questions" toggle and
// no read-only defaults block — the list simply IS the user's list.
//
// Every mutation invalidates the in-memory catalog (questions.ts), so the very
// next "+ כתיבה מודרכת" tap draws from the updated pool.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react';
import {
  fetchMyVisionQuestions,
  createMyVisionQuestion,
  updateMyVisionQuestion,
  deleteMyVisionQuestion,
  seedDefaultQuestionsIfNeeded,
  type VisionQuestionRow,
} from './questions';
import type { VisionScope } from './period';
import { useJournalingEnabled } from './journalingFeature';
import { CompassLoader } from '../../components/CompassLoader';

const SCOPE_LABELS: Record<VisionScope, string> = {
  yearly: 'שנתי',
  monthly: 'חודשי',
  weekly: 'שבועי',
  daily: 'יומי',
};

const BASE_SCOPES: VisionScope[] = ['yearly', 'monthly', 'weekly'];

type Props = {
  open: boolean;
  /** The scope the editor is currently on — the sheet opens on it. */
  initialScope: VisionScope;
  onClose: () => void;
};

export function VisionQuestionSettingsSheet({
  open,
  initialScope,
  onClose,
}: Props) {
  const journalingOn = useJournalingEnabled();
  // The daily tab shows when the Journaling feature is on (matches the Vision
  // view switcher). If the editor opened the sheet on 'daily', include it too.
  const scopes: VisionScope[] =
    journalingOn || initialScope === 'daily'
      ? [...BASE_SCOPES, 'daily']
      : BASE_SCOPES;

  const [scope, setScope] = useState<VisionScope>(initialScope);
  const [rows, setRows] = useState<VisionQuestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      // Seed the personal list from the defaults on first open, then read it.
      await seedDefaultQuestionsIfNeeded();
      setRows(await fetchMyVisionQuestions());
    } catch (e) {
      setError(describeError(e, 'שגיאה בטעינה'));
    }
  }, []);

  // Reset to the editor's scope and reload whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setScope(initialScope);
    setDraft('');
    setEditingId(null);
    void load();
  }, [open, initialScope, load]);

  if (!open) return null;

  const scoped = (rows ?? []).filter((r) => r.scope === scope);

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const maxOrder = scoped.reduce((m, r) => Math.max(m, r.sort_order), 0);
      await createMyVisionQuestion(scope, text, maxOrder + 10);
      setDraft('');
      setRows(await fetchMyVisionQuestions());
    } catch (e) {
      setError(describeError(e, 'שגיאה בהוספה'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    const text = editText.trim();
    if (!editingId || !text) return;
    setBusy(true);
    try {
      await updateMyVisionQuestion(editingId, text);
      setEditingId(null);
      setRows(await fetchMyVisionQuestions());
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (r: VisionQuestionRow) => {
    if (!window.confirm(`למחוק את השאלה?\n"${r.text}"`)) return;
    setBusy(true);
    try {
      await deleteMyVisionQuestion(r.id);
      setRows(await fetchMyVisionQuestions());
    } catch (e) {
      setError(describeError(e, 'שגיאה במחיקה'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="השאלות שלי לכתיבה מודרכת"
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
          <span className="text-sm font-semibold text-ink-100">
            השאלות שלי
          </span>
          {/* Spacer balances the close button so the title stays centred. */}
          <span className="w-9 h-9" />
        </div>

        {/* Scroll container is dir="ltr" so the (forest-green) scrollbar parks
            on the RIGHT in RTL; the inner content flips back to dir="rtl". */}
        <div
          dir="ltr"
          className="flex-1 overflow-y-auto vision-feed-scroll px-4 py-3"
        >
          <div dir="rtl">
            {/* Scope chips */}
            <div className="flex gap-1.5 mb-3">
              {scopes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setScope(s);
                    setEditingId(null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    scope === s
                      ? 'bg-forest-700 text-on-accent border-forest-700'
                      : 'bg-surface-card text-ink-300 border-surface-border hover:text-ink-100'
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 light:text-red-700 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {/* Composer */}
            <div className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-3 py-2.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                dir="rtl"
                placeholder={`שאלה משלך לחזון ה${SCOPE_LABELS[scope]}…`}
                className="w-full resize-none rounded-xl bg-surface-raised border border-surface-border px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-forest-600"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={busy || draft.trim().length === 0}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-forest-700 hover:bg-forest-800 text-on-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={16} />
                  הוסף שאלה
                </button>
              </div>
            </div>

            {rows === null && !error && (
              <div className="py-6">
                <CompassLoader size="md" />
              </div>
            )}

            {/* The user's own questions (seeded from the defaults on first open) */}
            {rows !== null && scoped.length === 0 && (
              <div className="mb-1 rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-6 text-center text-ink-300 text-[13px]">
                אין שאלות לחזון ה{SCOPE_LABELS[scope]}. הוסף שאלה משלך למעלה.
              </div>
            )}
            {scoped.length > 0 && (
              <ul className="space-y-2 mb-1">
                {scoped.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-surface-border bg-surface-card px-3 py-2.5"
                  >
                    {editingId === r.id ? (
                      <>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          dir="rtl"
                          autoFocus
                          className="w-full resize-none rounded-xl bg-surface-raised border border-surface-border px-3 py-2 text-sm text-ink-100 focus:outline-none focus:border-forest-600"
                        />
                        <div className="mt-2 flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit()}
                            disabled={busy || editText.trim().length === 0}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-forest-500/60 text-forest-700 hover:bg-forest-500/10 disabled:opacity-50"
                          >
                            <Check size={14} />
                            שמור
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-surface-border text-ink-100 hover:bg-surface-raised disabled:opacity-50"
                          >
                            <X size={14} />
                            בטל
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="flex-1 min-w-0 text-sm text-ink-100 leading-relaxed">
                          {r.text}
                        </p>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(r.id);
                              setEditText(r.text);
                            }}
                            disabled={busy}
                            aria-label="ערוך"
                            title="ערוך"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-ink-300 hover:text-ink-100 hover:bg-surface-raised disabled:opacity-50"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(r)}
                            disabled={busy}
                            aria-label="מחק"
                            title="מחק"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-red-400/80 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function describeError(e: unknown, fallback: string): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message : null;
    const code = typeof obj.code === 'string' ? obj.code : null;
    const hint = typeof obj.hint === 'string' ? obj.hint : null;
    const details = typeof obj.details === 'string' ? obj.details : null;
    const parts = [msg, code && `[${code}]`, hint, details].filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  return fallback;
}
