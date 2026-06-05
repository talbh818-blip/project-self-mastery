// ============================================================================
// EditDetailsSheet — modal for editing personal identity fields.
// Lifted out of the User screen so the screen itself stays compact.
// ============================================================================
import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfile } from '../admin/ProfileContext';
import { updateProfileFields } from './mutations';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function EditDetailsSheet({ open, onClose }: Props) {
  const { user } = useAuth();
  const { profile, refresh } = useCurrentProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state with profile every time the sheet opens.
  useEffect(() => {
    if (!open || !profile) return;
    setFirstName(profile.first_name ?? '');
    setLastName(profile.last_name ?? '');
    setPhone(profile.phone ?? '');
    setSaving(false);
    setSaved(false);
    setError(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, profile?.id]);

  if (!open || !profile) return null;

  const dirty =
    (profile.first_name ?? '') !== firstName ||
    (profile.last_name ?? '') !== lastName ||
    (profile.phone ?? '') !== phone;

  const handleSave = async () => {
    if (!user || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfileFields(user.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      });
      await refresh();
      setSaved(true);
      window.setTimeout(() => {
        onClose();
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col animate-modal-rise-in"
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
          <h2 className="text-lg font-semibold text-ink-100">פרטים אישיים</h2>
          <div className="w-7" />
        </header>

        <div className="px-5 py-4 space-y-3">
          <Field label="שם פרטי">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={80}
              className="w-full bg-surface-raised text-ink-100 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500"
              dir="rtl"
            />
          </Field>

          <Field label="שם משפחה">
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={80}
              className="w-full bg-surface-raised text-ink-100 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500"
              dir="rtl"
            />
          </Field>

          <Field label="אימייל" hint="מהחשבון של Google — לא ניתן לשינוי">
            <input
              type="email"
              value={profile.email ?? ''}
              disabled
              className="w-full bg-surface-raised/50 text-ink-300 rounded-xl px-3 py-2 text-sm border border-surface-border cursor-not-allowed"
              dir="ltr"
            />
          </Field>

          <Field label="טלפון">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              placeholder="050-0000000"
              className="w-full bg-surface-raised text-ink-100 placeholder-ink-500 rounded-xl px-3 py-2 text-sm border border-surface-border focus:outline-none focus:border-forest-500"
              dir="ltr"
            />
          </Field>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || saved}
            className="w-full bg-forest-700 disabled:bg-forest-700/30 disabled:text-cream-50/60 text-cream-50 font-medium rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {saved ? (
              <>
                <Check size={16} /> נשמר
              </>
            ) : (
              <>{saving ? 'שומר…' : 'שמור'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-ink-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-ink-500 mt-1">{hint}</p>}
    </div>
  );
}
