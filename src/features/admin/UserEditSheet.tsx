// ============================================================================
// UserEditSheet — admin form to edit every (non-privacy) field on a profile.
// ----------------------------------------------------------------------------
// Bottom sheet shaped like BookEditSheet so the admin screens feel consistent.
// Privacy controls (vision_visibility / habits_visibility) are deliberately
// NOT exposed — those belong to the user alone.
//
// Note on email: profiles.email is just a cached copy of auth.users.email.
// Editing it here updates the profile row, but at the user's next login
// useProfile.ts will overwrite it with the real auth email coming back from
// Google OAuth. We surface a small hint instead of hiding the field, since
// the admin asked for "everything I want to edit".
// ============================================================================
import { useEffect, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import type { Gender, Profile, Theme } from './types';
import type { ProfileAdminPatch } from './queries';

type Props = {
  open: boolean;
  profile: Profile | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (patch: ProfileAdminPatch) => Promise<void>;
};

type FormState = {
  display_name: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  gender: Gender | null;
  theme: Theme;
  trees_planted: string;
  score_adjustment: string;
  blocked: boolean;
};

function profileToForm(p: Profile): FormState {
  return {
    display_name: p.display_name ?? '',
    email: p.email ?? '',
    first_name: p.first_name ?? '',
    last_name: p.last_name ?? '',
    phone: p.phone ?? '',
    gender: p.gender,
    theme: p.theme,
    trees_planted: String(p.trees_planted),
    score_adjustment: String(p.score_adjustment),
    blocked: p.blocked,
  };
}

export function UserEditSheet({
  open,
  profile,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState | null>(
    profile ? profileToForm(profile) : null,
  );
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form every time we open with a new profile.
  useEffect(() => {
    if (!open) return;
    setForm(profile ? profileToForm(profile) : null);
    setError(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, profile]);

  if (!open || !form || !profile) return null;

  const trees = Number(form.trees_planted);
  const treesOk = Number.isFinite(trees) && Number.isInteger(trees) && trees >= 0;
  const adj = Number(form.score_adjustment);
  const adjOk = Number.isFinite(adj) && Number.isInteger(adj);
  const canSubmit = treesOk && adjOk && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    // Build the patch by diffing the original profile against the form.
    // Sending only the changed fields means a no-op edit doesn't bump
    // updated_at and we don't fight with concurrent writes for free.
    const patch: ProfileAdminPatch = {};
    const normalize = (s: string): string | null => {
      const t = s.trim();
      return t.length > 0 ? t : null;
    };
    if (normalize(form.display_name) !== profile.display_name)
      patch.display_name = normalize(form.display_name);
    if (normalize(form.email) !== profile.email)
      patch.email = normalize(form.email);
    if (normalize(form.first_name) !== profile.first_name)
      patch.first_name = normalize(form.first_name);
    if (normalize(form.last_name) !== profile.last_name)
      patch.last_name = normalize(form.last_name);
    if (normalize(form.phone) !== profile.phone)
      patch.phone = normalize(form.phone);
    if (form.gender !== profile.gender) patch.gender = form.gender;
    if (form.theme !== profile.theme) patch.theme = form.theme;
    if (trees !== profile.trees_planted) patch.trees_planted = trees;
    if (adj !== profile.score_adjustment) patch.score_adjustment = adj;
    if (form.blocked !== profile.blocked) patch.blocked = form.blocked;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    try {
      await onSubmit(patch);
      onClose();
    } catch (e) {
      setError(describeError(e, 'שגיאה בשמירה'));
    }
  };

  const display =
    profile.display_name ?? profile.email ?? profile.id.slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
            type="button"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100 truncate max-w-[60%]">
            עריכת {display}
          </h2>
          <div className="w-7" />
        </header>

        {error && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-xl border border-red-800/60 bg-red-950/40 text-red-300 text-sm px-3 py-2.5 flex items-start gap-2"
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Identity */}
          <Section title="זהות">
            <Field label="שם תצוגה">
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שם פרטי">
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="שם משפחה">
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field
              label="אימייל"
              hint="האימייל מסתנכרן אוטומטית מ-Google בכל כניסה ויחזור לערך המקורי."
              hintIcon={<Info size={11} />}
            >
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
                dir="ltr"
              />
            </Field>
            <Field label="טלפון">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
                dir="ltr"
              />
            </Field>
            <Field label="מגדר">
              <div className="flex gap-2">
                {(
                  [
                    { value: null, label: 'לא צוין' },
                    { value: 'male' as const, label: 'גבר' },
                    { value: 'female' as const, label: 'אישה' },
                  ]
                ).map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setForm({ ...form, gender: opt.value })}
                    className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${
                      form.gender === opt.value
                        ? 'bg-forest-700 text-on-accent border-forest-700'
                        : 'bg-surface-raised text-ink-300 border-surface-border hover:text-ink-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {/* Preferences */}
          <Section title="העדפות">
            <Field label="ערכת נושא">
              <div className="flex gap-2">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, theme: t })}
                    className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${
                      form.theme === t
                        ? 'bg-forest-700 text-on-accent border-forest-700'
                        : 'bg-surface-raised text-ink-300 border-surface-border hover:text-ink-100'
                    }`}
                  >
                    {t === 'dark' ? 'כהה' : 'בהיר'}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          {/* Admin-only controls */}
          <Section title="פעולות אדמין">
            <div className="grid grid-cols-2 gap-3">
              <Field label="עצים שתולים">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.trees_planted}
                  onChange={(e) =>
                    setForm({ ...form, trees_planted: e.target.value })
                  }
                  className={`${inputClass} ${treesOk ? '' : 'border-red-500/60'}`}
                />
              </Field>
              <Field
                label="התאמת ניקוד"
                hint="מספר שלם (חיובי או שלילי) שמתווסף לניקוד המחושב."
              >
                <input
                  type="number"
                  step={1}
                  value={form.score_adjustment}
                  onChange={(e) =>
                    setForm({ ...form, score_adjustment: e.target.value })
                  }
                  className={`${inputClass} ${adjOk ? '' : 'border-red-500/60'}`}
                />
              </Field>
            </div>
            <label className="flex items-center justify-between bg-surface-raised border border-surface-border rounded-xl px-3 py-2.5 cursor-pointer">
              <div>
                <div className="text-sm text-ink-100">חסום גישה לאפליקציה</div>
                <div className="text-[11px] text-ink-300 mt-0.5">
                  המשתמש יראה מסך "החשבון חסום" וינותק.
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.blocked}
                onChange={(e) => setForm({ ...form, blocked: e.target.checked })}
                className="w-5 h-5 accent-red-500"
              />
            </label>
          </Section>

          {/* Privacy disclaimer */}
          <div className="rounded-xl border border-surface-border bg-surface-raised/60 px-3 py-2.5 text-[12px] text-ink-300 leading-relaxed flex items-start gap-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              הגדרות פרטיות (חשון/הרגלים) של המשתמש לא מוצגות ולא ניתנות
              לעריכה כאן — רק המשתמש בעצמו יכול לשנות אותן.
            </span>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-surface-border flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-surface-border text-ink-100 py-2.5 text-sm hover:bg-surface-raised disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-forest-700 text-on-accent font-bold py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'שומר…' : 'שמור'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Local helpers (kept private to the sheet) ──────────────────────────────

const inputClass =
  'w-full bg-surface-raised text-ink-100 placeholder-ink-500 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-300">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  hintIcon,
  children,
}: {
  label: string;
  hint?: string;
  hintIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-ink-300 mb-1.5">{label}</div>
      {children}
      {hint && (
        <div className="mt-1 text-[10.5px] text-ink-300/80 leading-snug flex items-start gap-1">
          {hintIcon && <span className="mt-[1px] shrink-0">{hintIcon}</span>}
          <span>{hint}</span>
        </div>
      )}
    </label>
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
