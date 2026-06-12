// ============================================================================
// VisionQuestionSettingsSheet — the user's own guided-writing questions.
// ----------------------------------------------------------------------------
// Opened from the gear next to the "+ כתיבה מודרכת" button. Per scope
// (שנתי / חודשי / שבועי) the user can:
//   • add / edit / delete their own questions (vision_user_questions, RLS
//     owner-only — personal content, nobody else reads it);
//   • flip "רק השאלות שלי" — hide the admin defaults wherever they have at
//     least one question of their own (profiles.vision_questions_own_only).
// The defaults are listed read-only below for reference.
//
// Every mutation invalidates the in-memory catalog (questions.ts), so the
// very next "+ כתיבה מודרכת" tap draws from the updated pool.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react';
import {
  fetchMyVisionQuestions,
  createMyVisionQuestion,
  updateMyVisionQuestion,
  deleteMyVisionQuestion,
  defaultQuestionsForScope,
  ownOnlyPref,
  setOwnOnlyPref,
  ensureQuestionsLoaded,
  type VisionQuestionRow,
} from './questions';
import type { VisionScope } from './period';
import { CompassLoader } from '../../components/CompassLoader';

const SCOPE_LABELS: Record<VisionScope, string> = {
  yearly: 'שנתי',
  monthly: 'חודשי',
  weekly: 'שבועי',
};

const SCOPES: VisionScope[] = ['yearly', 'monthly', 'weekly'];

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
  const [scope, setScope] = useState<VisionScope>(initialScope);
  const [rows, setRows] = useState<VisionQuestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyOwn, setOnlyOwn] = useState(ownOnlyPref());

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      // ensure first so defaultQuestionsForScope / ownOnlyPref are fresh.
      await ensureQuestionsLoaded();
      setOnlyOwn(ownOnlyPref());
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
  const defaults = defaultQuestionsForScope(scope);

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

  const handleToggleOnlyOwn = async () => {
    const next = !onlyOwn;
    setOnlyOwn(next); // optimistic
    try {
      await setOwnOnlyPref(next);
    } catch (e) {
      setOnlyOwn(!next);
      setError(describeError(e, 'שגיאה בשמירת ההעדפה'));
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

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Scope chips */}
          <div className="flex gap-1.5 mb-3">
            {SCOPES.map((s) => (
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
            <div className="mb-3 rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
              {error}
            </div>
          )}

          {/* "Only my questions" toggle */}
          <button
            type="button"
            onClick={() => void handleToggleOnlyOwn()}
            role="switch"
            aria-checked={onlyOwn}
            className="w-full mb-3 flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-raised/50 px-3 py-2.5 text-right"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-100">
                רק השאלות שלי
              </span>
              <span className="block text-[11px] text-ink-300 leading-snug mt-0.5">
                הסתר את שאלות ברירת המחדל בכל סוג חזון שיש בו שאלות משלך
              </span>
            </span>
            <span
              aria-hidden
              className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${
                onlyOwn ? 'bg-forest-700' : 'bg-surface-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  onlyOwn ? '-translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

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

          {/* The user's own questions */}
          {rows !== null && scoped.length === 0 && (
            <div className="mb-3 rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-6 text-center text-ink-300 text-[13px]">
              עוד אין לך שאלות משלך לחזון ה{SCOPE_LABELS[scope]}.
            </div>
          )}
          {scoped.length > 0 && (
            <ul className="space-y-2 mb-3">
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
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-forest-500/60 text-forest-400 hover:bg-forest-500/10 disabled:opacity-50"
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

          {/* Defaults — read-only reference (dimmed when hidden by the toggle) */}
          <div className="mt-1">
            <div className="text-[11px] font-semibold text-ink-300 mb-1.5">
              שאלות ברירת המחדל
              {onlyOwn && scoped.length > 0 && (
                <span className="font-normal"> · מוסתרות כרגע בסוג הזה</span>
              )}
            </div>
            <ul
              className={`space-y-1 ${
                onlyOwn && scoped.length > 0 ? 'opacity-40' : ''
              }`}
            >
              {defaults.map((q) => (
                <li
                  key={q.id}
                  className="text-[13px] text-ink-300 leading-relaxed px-3 py-1.5 rounded-xl bg-surface-raised/40"
                >
                  {q.text}
                </li>
              ))}
            </ul>
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
