// ============================================================================
// UserEditSheet — admin form to edit every (non-privacy) field on a profile.
// ----------------------------------------------------------------------------
// Bottom sheet shaped like BookEditSheet so the admin screens feel consistent.
// Privacy controls (vision_visibility / habits_visibility) and the user's
// theme preference are deliberately NOT exposed — those belong to the user.
//
// Avatar is uploaded under the ADMIN's storage folder via
// uploadAvatarForUser() (the only path RLS allows from the admin's session),
// and the resulting public URL is folded into the same save patch.
//
// Note on email: profiles.email is just a cached copy of auth.users.email.
// Editing it here updates the profile row, but at the user's next login
// useProfile.ts will overwrite it with the real auth email coming back from
// Google OAuth. We surface a small hint instead of hiding the field, since
// the admin asked for "everything I want to edit".
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Info, Trash2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Emoji } from '../../components/Emoji';
import type { Gender, Profile } from './types';
import { uploadAvatarForUser, type ProfileAdminPatch } from './queries';

type Props = {
  open: boolean;
  profile: Profile | null;
  /**
   * The user's log-based score (V*5 - X*3 across all their habit_logs),
   * excluding score_adjustment. Passed in from the admin screen where it's
   * already fetched as part of the activity rollup. Used so the "ניקוד"
   * input can display the CURRENT total (log_score + adjustment) — the
   * number the admin actually sees on the card — while still saving to
   * score_adjustment behind the scenes.
   */
  logScore: number;
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
  trees_planted: string;
  /**
   * Displayed as the CURRENT TOTAL score (log_score + score_adjustment).
   * On save we compute the delta relative to logScore and write that to
   * profiles.score_adjustment — the admin never has to reason about the
   * adjustment being a delta rather than the number itself.
   */
  score_total: string;
  blocked: boolean;
  // null = no change; '' = explicit clear (set avatar_url to null);
  // string = new uploaded URL.
  avatar_url_change: string | null;
};

function profileToForm(p: Profile, logScore: number): FormState {
  return {
    display_name: p.display_name ?? '',
    email: p.email ?? '',
    first_name: p.first_name ?? '',
    last_name: p.last_name ?? '',
    phone: p.phone ?? '',
    gender: p.gender,
    trees_planted: String(p.trees_planted),
    score_total: String(logScore + p.score_adjustment),
    blocked: p.blocked,
    avatar_url_change: null,
  };
}

export function UserEditSheet({
  open,
  profile,
  logScore,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const { user: adminUser } = useAuth();
  const [form, setForm] = useState<FormState | null>(
    profile ? profileToForm(profile, logScore) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed the form every time we open with a new profile.
  useEffect(() => {
    if (!open) return;
    setForm(profile ? profileToForm(profile, logScore) : null);
    setError(null);
    setUploadingAvatar(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, profile, logScore]);

  if (!open || !form || !profile) return null;

  const trees = Number(form.trees_planted);
  const treesOk = Number.isFinite(trees) && Number.isInteger(trees) && trees >= 0;
  const totalScore = Number(form.score_total);
  const scoreOk = Number.isFinite(totalScore) && Number.isInteger(totalScore);
  const canSubmit = treesOk && scoreOk && !submitting && !uploadingAvatar;

  // What the avatar circle currently shows: the new uploaded URL (if any),
  // or the explicit clear (no image), or the saved profile avatar.
  const previewAvatar =
    form.avatar_url_change !== null ? form.avatar_url_change : profile.avatar_url;
  const displayName =
    profile.display_name ?? profile.email ?? profile.id.slice(0, 8);
  const initials = (displayName || '?').slice(0, 2).toUpperCase();

  const handlePickAvatar = () => fileInputRef.current?.click();

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !adminUser) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const url = await uploadAvatarForUser(adminUser.id, profile.id, file);
      setForm((f) => (f ? { ...f, avatar_url_change: url } : f));
    } catch (err) {
      setError(describeError(err, 'שגיאה בהעלאת תמונה'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleClearAvatar = () => {
    setForm((f) => (f ? { ...f, avatar_url_change: '' } : f));
  };

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
    if (trees !== profile.trees_planted) patch.trees_planted = trees;
    // Admin edited a TOTAL score in the UI. Translate back to an adjustment
    // delta: whatever offset from log_score makes the total land on the
    // typed value. If log_score changes later (user marks more Vs) the
    // adjustment stays put, so the total drifts naturally with activity —
    // which is the whole point of an adjustment rather than a snapshot.
    const nextAdjustment = totalScore - logScore;
    if (nextAdjustment !== profile.score_adjustment) {
      patch.score_adjustment = nextAdjustment;
    }
    if (form.blocked !== profile.blocked) patch.blocked = form.blocked;
    // avatar_url_change:
    //   null  → no change
    //   ''    → explicit clear (set column to null)
    //   other → uploaded URL
    if (form.avatar_url_change !== null) {
      patch.avatar_url = form.avatar_url_change === '' ? null : form.avatar_url_change;
    }

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
          <h2 className="text-base font-semibold text-ink-100 truncate max-w-[60%]">
            עריכת {displayName}
          </h2>
          <div className="w-7" />
        </header>

        {error && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 light:text-red-700 text-xs px-3 py-2 flex items-start gap-2"
          >
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto themed-scroll px-5 py-3 space-y-3">
          {/* Identity row — avatar on the right (RTL: first DOM child is
              rightmost), three name fields stacked on the left. Packs four
              elements into one row that used to take four. */}
          <div className="flex items-start gap-3">
            {/* Avatar with camera badge + "הסר תמונה" link */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="relative">
                {previewAvatar ? (
                  <img
                    src={previewAvatar}
                    alt=""
                    className="w-[72px] h-[72px] rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-[72px] h-[72px] rounded-full bg-forest-700 text-on-accent text-xl font-bold flex items-center justify-center">
                    {initials}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handlePickAvatar}
                  disabled={uploadingAvatar || submitting}
                  aria-label="החלף תמונה"
                  className="absolute bottom-0 -left-1 w-7 h-7 rounded-full bg-forest-700 text-on-accent flex items-center justify-center shadow border-2 border-surface-card disabled:opacity-50"
                >
                  <Camera size={13} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFile}
                  className="hidden"
                />
              </div>
              {previewAvatar ? (
                <button
                  type="button"
                  onClick={handleClearAvatar}
                  className="text-[10px] text-ink-300 hover:text-red-400 inline-flex items-center gap-1"
                >
                  <Trash2 size={10} /> הסר
                </button>
              ) : uploadingAvatar ? (
                <span className="text-[10px] text-ink-300">מעלה…</span>
              ) : (
                <span className="text-[10px] text-ink-500">תמונה</span>
              )}
            </div>

            {/* Three stacked name fields */}
            <div className="flex-1 min-w-0 space-y-2">
              <Field label="שם תצוגה">
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>

          {/* Email + phone on one row */}
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="אימייל"
              hint="מסתנכרן מ-Google בכל כניסה."
              hintIcon={<Info size={10} />}
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
          </div>

          {/* Gender with colored icons */}
          <Field label="מגדר">
            <div className="grid grid-cols-3 gap-2">
              <GenderBtn
                kind="male"
                active={form.gender === 'male'}
                onClick={() => setForm({ ...form, gender: 'male' })}
              />
              <GenderBtn
                kind="female"
                active={form.gender === 'female'}
                onClick={() => setForm({ ...form, gender: 'female' })}
              />
              <GenderBtn
                kind="none"
                active={form.gender === null}
                onClick={() => setForm({ ...form, gender: null })}
              />
            </div>
          </Field>

          {/* Trees + score, with 3D emoji inside the labels.
              Fluent 3D emoji match the celebratory tone of the planting +
              version-gate flows where 🌳 and ⭐ already appear. */}
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label={
                <span className="inline-flex items-center gap-1">
                  <Emoji emoji="🌳" size={14} ariaLabel="" />
                  עצים שתולים
                </span>
              }
            >
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
              label={
                <span className="inline-flex items-center gap-1">
                  <Emoji emoji="⭐" size={14} ariaLabel="" />
                  ניקוד
                </span>
              }
            >
              <input
                type="number"
                step={1}
                value={form.score_total}
                onChange={(e) =>
                  setForm({ ...form, score_total: e.target.value })
                }
                className={`${inputClass} ${scoreOk ? '' : 'border-red-500/60'}`}
              />
            </Field>
          </div>

          {/* Block toggle */}
          <label className="flex items-center justify-between bg-surface-raised border border-surface-border rounded-xl px-3 py-2 cursor-pointer">
            <div>
              <div className="text-sm text-ink-100">חסום גישה</div>
              <div className="text-[10.5px] text-ink-300 mt-0.5">
                המשתמש יראה "החשבון חסום" וינותק.
              </div>
            </div>
            <input
              type="checkbox"
              checked={form.blocked}
              onChange={(e) => setForm({ ...form, blocked: e.target.checked })}
              className="w-5 h-5 accent-red-500"
            />
          </label>

          {/* Privacy disclaimer — kept very small */}
          <div className="text-[10.5px] text-ink-300/80 leading-snug flex items-start gap-1.5 px-1">
            <Info size={11} className="shrink-0 mt-0.5" />
            <span>
              הגדרות פרטיות וערכת נושא של המשתמש לא ניתנות לעריכה כאן.
            </span>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-surface-border flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || uploadingAvatar}
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

// ── Local helpers ────────────────────────────────────────────────────────────

const inputClass =
  'w-full bg-surface-raised text-ink-100 placeholder-ink-500 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500';

function Field({
  label,
  hint,
  hintIcon,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  hintIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] text-ink-300 mb-1">{label}</div>
      {children}
      {hint && (
        <div className="mt-0.5 text-[10px] text-ink-300/80 leading-snug flex items-start gap-1">
          {hintIcon && <span className="mt-[1px] shrink-0">{hintIcon}</span>}
          <span>{hint}</span>
        </div>
      )}
    </label>
  );
}

// Gender button with ♂ / ♀ glyphs and active colors per the spec:
// male = blue, female = pink, none = neutral.
function GenderBtn({
  kind,
  active,
  onClick,
}: {
  kind: 'male' | 'female' | 'none';
  active: boolean;
  onClick: () => void;
}) {
  const labels: Record<typeof kind, string> = {
    male: 'גבר',
    female: 'אישה',
    none: 'לא צוין',
  };
  // Unicode glyphs render reliably across platforms without dragging in a new
  // icon — Lucide 0.460 doesn't ship Mars/Venus yet. The font fallback keeps
  // them legible at small sizes.
  const glyph: Record<typeof kind, string> = {
    male: '♂',
    female: '♀',
    none: '—',
  };
  const activeClass: Record<typeof kind, string> = {
    male: 'bg-sky-500/25 border-sky-400 text-sky-200',
    female: 'bg-pink-500/25 border-pink-400 text-pink-200',
    none: 'bg-surface-border border-surface-border text-ink-100',
  };
  const idleClass =
    'bg-surface-raised text-ink-300 border-surface-border hover:text-ink-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm transition-colors ${
        active ? activeClass[kind] : idleClass
      }`}
    >
      <span className="text-base leading-none">{glyph[kind]}</span>
      {labels[kind]}
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
