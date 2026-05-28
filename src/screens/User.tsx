// ============================================================================
// User screen — personal control center.
// Avatar, identity fields, theme toggle, feedback/support shortcuts, legal
// links, and sign-out. All data lives on public.profiles.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCircle,
  Camera,
  LogOut,
  MessageSquare,
  LifeBuoy,
  Shield,
  FileText,
  ChevronLeft,
  Moon,
  Sun,
  Check,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCurrentProfile } from '../features/admin/ProfileContext';
import {
  updateProfileFields,
  updateTheme,
  uploadAvatar,
} from '../features/user/mutations';
import { TicketSheet } from '../features/user/TicketSheet';
import type { Theme } from '../features/admin/types';

export function User() {
  const { user, signOut } = useAuth();
  const { profile, loading, refresh } = useCurrentProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ticketKind, setTicketKind] = useState<'feedback' | 'support' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local edit state with profile whenever it (re)loads.
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? '');
    setLastName(profile.last_name ?? '');
    setPhone(profile.phone ?? '');
  }, [profile?.id, profile?.first_name, profile?.last_name, profile?.phone]);

  const dirty =
    profile !== null &&
    ((profile.first_name ?? '') !== firstName ||
      (profile.last_name ?? '') !== lastName ||
      (profile.phone ?? '') !== phone);

  const handleSave = async () => {
    if (!user || !dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfileFields(user.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      });
      await refresh();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file again still fires
    if (!file || !user) return;
    setUploading(true);
    try {
      await uploadAvatar(user.id, file);
      await refresh();
    } catch (err) {
      console.error('[avatar upload]', err);
    } finally {
      setUploading(false);
    }
  };

  const handleThemeToggle = async (next: Theme) => {
    if (!user || !profile || profile.theme === next) return;
    // Optimistic: flip the DOM attribute immediately so the UI updates
    // without waiting on the network round-trip.
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('app-theme', next);
    } catch {
      // ignore
    }
    try {
      await updateTheme(user.id, next);
      await refresh();
    } catch (err) {
      console.error('[theme update]', err);
    }
  };

  if (loading || !profile) {
    return (
      <section className="pt-2">
        <h1 className="text-2xl font-semibold text-ink-100 mb-4">משתמש</h1>
        <p className="text-ink-300 text-sm">טוען…</p>
      </section>
    );
  }

  const avatarUrl = profile.avatar_url;
  const theme: Theme = profile.theme ?? 'dark';

  return (
    <section className="pt-1 pb-6 space-y-4">
      <h1 className="text-2xl font-semibold text-ink-100">משתמש</h1>

      {/* Avatar + display name */}
      <div className="bg-surface-card rounded-2xl p-5 flex flex-col items-center text-center">
        <button
          type="button"
          onClick={handleAvatarClick}
          className="relative group"
          aria-label="החלף תמונת פרופיל"
          disabled={uploading}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-24 h-24 rounded-full object-cover border-2 border-surface-border"
            />
          ) : (
            <UserCircle
              size={96}
              strokeWidth={1.2}
              className="text-ink-300"
            />
          )}
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-forest-700 flex items-center justify-center border-2 border-surface-card group-hover:bg-forest-600 transition-colors">
            <Camera size={14} className="text-cream-50" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
        <p className="mt-3 text-ink-100 font-medium">
          {profile.display_name ?? profile.email ?? 'משתמש'}
        </p>
        {uploading && (
          <p className="text-xs text-ink-300 mt-1">מעלה תמונה…</p>
        )}
      </div>

      {/* Identity fields */}
      <div className="bg-surface-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink-100">פרטים אישיים</h2>

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

        {saveError && (
          <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">
            {saveError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="w-full bg-forest-700 disabled:bg-forest-700/30 disabled:text-cream-50/60 text-cream-50 font-medium rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          {savedFlash ? (
            <>
              <Check size={16} /> נשמר
            </>
          ) : (
            <>{saving ? 'שומר…' : 'שמור'}</>
          )}
        </button>
      </div>

      {/* Theme toggle */}
      <div className="bg-surface-card rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-ink-100 mb-3">תצוגה</h2>
        <div
          role="radiogroup"
          aria-label="ערכת נושא"
          className="flex bg-surface-raised rounded-xl p-1 gap-1"
        >
          <ThemeOption
            label="מצב כהה"
            icon={<Moon size={16} />}
            active={theme === 'dark'}
            onClick={() => handleThemeToggle('dark')}
          />
          <ThemeOption
            label="מצב בהיר"
            icon={<Sun size={16} />}
            active={theme === 'light'}
            onClick={() => handleThemeToggle('light')}
          />
        </div>
      </div>

      {/* Support */}
      <div className="bg-surface-card rounded-2xl overflow-hidden">
        <Row
          icon={<MessageSquare size={18} />}
          label="שלח פידבק"
          onClick={() => setTicketKind('feedback')}
        />
        <Divider />
        <Row
          icon={<LifeBuoy size={18} />}
          label="בקש תמיכה"
          onClick={() => setTicketKind('support')}
        />
      </div>

      {/* Info */}
      <div className="bg-surface-card rounded-2xl overflow-hidden">
        <LinkRow
          to="/privacy"
          icon={<Shield size={18} />}
          label="מדיניות פרטיות"
        />
        <Divider />
        <LinkRow
          to="/terms"
          icon={<FileText size={18} />}
          label="תנאי שימוש"
        />
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={signOut}
        className="w-full bg-surface-card text-red-400 hover:text-red-300 rounded-2xl py-3 flex items-center justify-center gap-2 font-medium transition-colors"
      >
        <LogOut size={18} />
        התנתקות
      </button>

      <TicketSheet
        open={ticketKind !== null}
        kind={ticketKind ?? 'feedback'}
        onClose={() => setTicketKind(null)}
      />
    </section>
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

function ThemeOption({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-forest-700 text-cream-50'
          : 'text-ink-300 hover:text-ink-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Row({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-3.5 text-ink-100 hover:bg-surface-raised/40 transition-colors"
    >
      <span className="flex items-center gap-3">
        <span className="text-ink-300">{icon}</span>
        <span className="text-sm">{label}</span>
      </span>
      <ChevronLeft size={16} className="text-ink-500" />
    </button>
  );
}

function LinkRow({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="w-full flex items-center justify-between px-5 py-3.5 text-ink-100 hover:bg-surface-raised/40 transition-colors"
    >
      <span className="flex items-center gap-3">
        <span className="text-ink-300">{icon}</span>
        <span className="text-sm">{label}</span>
      </span>
      <ChevronLeft size={16} className="text-ink-500" />
    </Link>
  );
}

function Divider() {
  return <div className="h-px bg-surface-border mx-5" />;
}
