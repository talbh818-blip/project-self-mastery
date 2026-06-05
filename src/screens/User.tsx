// ============================================================================
// User screen — personal control center.
// Compact top card (avatar + display name + quick action buttons), privacy
// settings, directory of other active users, legal links, and sign-out.
// ============================================================================
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCircle,
  Camera,
  LogOut,
  Pencil,
  HelpCircle,
  Shield,
  FileText,
  ChevronLeft,
  Settings,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCurrentProfile } from '../features/admin/ProfileContext';
import { updateTheme, uploadAvatar } from '../features/user/mutations';
import { EditDetailsSheet } from '../features/user/EditDetailsSheet';
import { TicketSheet } from '../features/user/TicketSheet';
import { PrivacySettingsSheet } from '../features/user/PrivacySettingsSheet';
import { UsersDirectory } from '../features/user/UsersDirectory';
import type { Theme } from '../features/admin/types';

export function User() {
  const { user, signOut } = useAuth();
  const { profile, loading, refresh } = useCurrentProfile();

  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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

  const handleThemeToggle = async () => {
    if (!user || !profile) return;
    const next: Theme = (profile.theme ?? 'dark') === 'dark' ? 'light' : 'dark';
    // Optimistic visual flip.
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
        <p className="text-ink-300 text-sm">טוען…</p>
      </section>
    );
  }

  const avatarUrl = profile.avatar_url;
  const theme: Theme = profile.theme ?? 'dark';
  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    profile.display_name ||
    profile.email ||
    'משתמש';

  return (
    <section className="pt-1 pb-6 space-y-4">
      {/* Compact top card: avatar (left in RTL) + name + action row */}
      <div className="bg-surface-card rounded-2xl p-4 flex items-center gap-4">
        {/* Avatar */}
        <button
          type="button"
          onClick={handleAvatarClick}
          className="relative group shrink-0"
          aria-label="החלף תמונת פרופיל"
          disabled={uploading}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-20 h-20 rounded-full object-cover border-2 border-surface-border"
            />
          ) : (
            <UserCircle
              size={80}
              strokeWidth={1.2}
              className="text-ink-300"
            />
          )}
          <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-forest-700 flex items-center justify-center border-2 border-surface-card group-hover:bg-forest-600 transition-colors">
            <Camera size={11} className="text-cream-50" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />

        {/* Name + action row */}
        <div className="flex-1 min-w-0">
          <p
            className="text-base font-semibold text-ink-100 truncate"
            title={fullName}
          >
            {fullName}
          </p>
          {uploading && (
            <p className="text-[10px] text-ink-300 mt-0.5">מעלה תמונה…</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <ActionIcon
              onClick={() => setEditOpen(true)}
              icon={<Pencil size={16} />}
              label="ערוך פרטים אישיים"
            />
            <ActionIcon
              onClick={() => setTicketOpen(true)}
              icon={<HelpCircle size={16} />}
              label="פידבק ועזרה"
            />
            <ThemeToggle theme={theme} onToggle={handleThemeToggle} />
          </div>
        </div>
      </div>

      {/* Privacy settings — single CTA opens sheet */}
      <button
        type="button"
        onClick={() => setPrivacyOpen(true)}
        className="w-full bg-surface-card rounded-2xl px-5 py-3.5 flex items-center justify-between hover:bg-surface-raised/40 transition-colors"
      >
        <span className="flex items-center gap-3">
          <Settings size={18} className="text-ink-300" />
          <span className="flex flex-col items-start">
            <span className="text-sm text-ink-100 font-medium">הגדרות פרטיות</span>
            <span className="text-[11px] text-ink-300">
              חזון: {visibilityLabel(profile.vision_visibility)} · הרגלים: {visibilityLabel(profile.habits_visibility)}
            </span>
          </span>
        </span>
        <ChevronLeft size={16} className="text-ink-500" />
      </button>

      {/* Active users directory */}
      <UsersDirectory />

      {/* Footer info rows */}
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

      <button
        type="button"
        onClick={signOut}
        className="w-full bg-surface-card text-red-400 hover:text-red-300 rounded-2xl py-3 flex items-center justify-center gap-2 font-medium transition-colors"
      >
        <LogOut size={18} />
        התנתקות
      </button>

      <EditDetailsSheet open={editOpen} onClose={() => setEditOpen(false)} />
      <TicketSheet open={ticketOpen} onClose={() => setTicketOpen(false)} />
      <PrivacySettingsSheet
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
      />
    </section>
  );
}

function visibilityLabel(v: string): string {
  if (v === 'public') return 'משותף עם כולם';
  if (v === 'specific') return 'משתמשים ספציפיים';
  return 'פרטי';
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      onClick={onToggle}
      aria-label={isLight ? 'עבור למצב כהה' : 'עבור למצב בהיר'}
      title={isLight ? 'מצב בהיר' : 'מצב כהה'}
      dir="ltr"
      className={`relative h-9 w-16 rounded-full overflow-hidden shrink-0 border transition-colors duration-300 ${
        isLight
          ? 'bg-gradient-to-b from-sky-300 to-sky-100 border-sky-200'
          : 'bg-gradient-to-b from-indigo-950 to-violet-900 border-indigo-800/70'
      }`}
    >
      {/* Night stars */}
      <span
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          isLight ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="absolute top-1.5 right-2.5 w-1 h-1 rounded-full bg-white/80" />
        <span className="absolute top-3.5 right-5 w-0.5 h-0.5 rounded-full bg-white/60" />
        <span className="absolute bottom-2 right-3.5 w-0.5 h-0.5 rounded-full bg-white/70" />
        <span className="absolute top-2 right-7 w-0.5 h-0.5 rounded-full bg-white/50" />
      </span>

      {/* Day cloud */}
      <span
        className={`pointer-events-none absolute bottom-1 left-1.5 transition-opacity duration-300 ${
          isLight ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="block w-6 h-2.5 rounded-full bg-white/85 blur-[1px]" />
        <span className="absolute -top-1 left-1.5 w-3 h-3 rounded-full bg-white/85 blur-[1px]" />
      </span>

      {/* Sliding knob — sun or moon */}
      <span
        className={`absolute top-1 left-1 w-7 h-7 rounded-full transition-transform duration-300 shadow-md ${
          isLight
            ? 'translate-x-7 bg-gradient-to-b from-yellow-200 to-amber-400 shadow-amber-500/40'
            : 'translate-x-0 bg-gradient-to-b from-slate-100 to-slate-300 shadow-black/40'
        }`}
      >
        {/* Soft glow / crater hint */}
        {isLight ? (
          <span className="absolute inset-0 rounded-full ring-2 ring-yellow-100/50" />
        ) : (
          <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-slate-400/40" />
        )}
      </span>
    </button>
  );
}

function ActionIcon({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-full bg-surface-raised text-ink-300 hover:bg-forest-700 hover:text-cream-50 flex items-center justify-center transition-colors"
    >
      {icon}
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
