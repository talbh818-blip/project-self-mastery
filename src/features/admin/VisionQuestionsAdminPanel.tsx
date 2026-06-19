// ============================================================================
// VisionQuestionsAdminPanel — admin management of the guided-writing prompts.
// ----------------------------------------------------------------------------
// Shown under the "שאלות" tab of the admin screen. Three scope chips
// (שנתי / חודשי / שבועי) filter the list; each question can be edited inline
// or deleted, and a composer at the top adds new ones to the active scope.
//
// Edits don't touch existing vision entries — the question text is snapshot
// onto the Tiptap node at insertion time, so history stays as written.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Check, X } from 'lucide-react';
import {
  fetchVisionQuestionsAdmin,
  createVisionQuestion,
  updateVisionQuestion,
  deleteVisionQuestion,
  type VisionQuestionRow,
} from '../vision/questions';
import type { VisionScope } from '../vision/period';
import { CompassLoader } from '../../components/CompassLoader';

const SCOPE_LABELS: Record<VisionScope, string> = {
  yearly: 'שנתי',
  monthly: 'חודשי',
  weekly: 'שבועי',
  daily: 'יומי',
};

// Daily prompts use the built-in fallback list (questions.ts) — not managed
// here yet — so the admin panel only manages yearly / monthly / weekly.
const SCOPES: VisionScope[] = ['yearly', 'monthly', 'weekly'];

export function VisionQuestionsAdminPanel() {
  const [scope, setScope] = useState<VisionScope>('yearly');
  const [rows, setRows] = useState<VisionQuestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Composer (new question) + inline edit state.
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchVisionQuestionsAdmin());
    } catch (e) {
      setError(describeError(e, 'שגיאה בטעינה'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scoped = (rows ?? []).filter((r) => r.scope === scope);

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      // New questions go to the end of the active scope's list.
      const maxOrder = scoped.reduce((m, r) => Math.max(m, r.sort_order), 0);
      await createVisionQuestion(scope, text, maxOrder + 10);
      setDraft('');
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בהוספה'));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (r: VisionQuestionRow) => {
    setEditingId(r.id);
    setEditText(r.text);
  };

  const handleSaveEdit = async () => {
    const text = editText.trim();
    if (!editingId || !text) return;
    setBusy(true);
    try {
      await updateVisionQuestion(editingId, text);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (r: VisionQuestionRow) => {
    if (
      !window.confirm(
        `למחוק את השאלה?\n"${r.text}"\n\nשאלות שכבר הוכנסו ליומנים של משתמשים יישארו שם — רק המאגר מתעדכן.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteVisionQuestion(r.id);
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה במחיקה'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Scope chips + refresh */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setScope(s);
                setEditingId(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                scope === s
                  ? 'bg-forest-700 text-on-accent border-forest-700'
                  : 'bg-surface-card text-ink-300 border-surface-border hover:text-ink-100'
              }`}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          רענן
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 light:text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Composer */}
      <div className="mb-4 rounded-2xl border border-surface-border bg-surface-card px-3 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          dir="rtl"
          placeholder={`שאלה חדשה לחזון ה${SCOPE_LABELS[scope]}…`}
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
        <div className="py-8">
          <CompassLoader size="md" />
        </div>
      )}

      {rows !== null && scoped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
          אין שאלות לחזון ה{SCOPE_LABELS[scope]} עדיין.
        </div>
      )}

      {scoped.length > 0 && (
        <ul className="space-y-2">
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
                    <ActionBtn
                      onClick={() => void handleSaveEdit()}
                      disabled={busy || editText.trim().length === 0}
                      icon={<Check size={14} />}
                      label="שמור"
                      variant="primary"
                    />
                    <ActionBtn
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                      icon={<X size={14} />}
                      label="בטל"
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="flex-1 min-w-0 text-sm text-ink-100 leading-relaxed">
                    {r.text}
                  </p>
                  <div className="flex gap-1.5 shrink-0">
                    <IconBtn
                      onClick={() => startEdit(r)}
                      disabled={busy}
                      label="ערוך"
                    >
                      <Pencil size={14} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => void handleDelete(r)}
                      disabled={busy}
                      label="מחק"
                      danger
                    >
                      <Trash2 size={14} />
                    </IconBtn>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? 'border-red-500/60 text-red-400 hover:bg-red-500/10'
          : 'border-surface-border text-ink-300 hover:text-ink-100 hover:bg-surface-raised'
      }`}
    >
      {children}
    </button>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon,
  label,
  variant = 'default',
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'primary';
}) {
  const styles =
    variant === 'primary'
      ? 'border-forest-500/60 text-forest-700 hover:bg-forest-500/10'
      : 'border-surface-border text-ink-100 hover:bg-surface-raised';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}
    >
      {icon}
      {label}
    </button>
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
