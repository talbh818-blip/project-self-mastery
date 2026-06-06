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
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCurrentProfile } from '../features/admin/ProfileContext';
import { updateTheme, uploadAvatar } from '../features/user/mutations';
import { EditDetailsSheet } from '../features/user/EditDetailsSheet';
import { TicketSheet } from '../features/user/TicketSheet';
import { PrivacyInline } from '../features/user/PrivacyInline';
import { UsersDirectory } from '../features/user/UsersDirectory';
import type { Theme } from '../features/admin/types';

export function User() {
  const { user, signOut } = useAuth();
  const { profile, loading, refresh } = useCurrentProfile();

  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
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
      {/* Profile card — avatar (right in RTL) + name + action row */}
      <div className="bg-surface-card rounded-2xl p-4 flex items-center gap-4">
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
            <UserCircle size={80} strokeWidth={1.2} className="text-ink-300" />
          )}
          <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-forest-700 flex items-center justify-center border-2 border-surface-card group-hover:bg-forest-600 transition-colors">
            <Camera size={11} className="text-on-accent" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />

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

      {/* Thin habits-privacy row (vision is always private, so not shown) */}
      <PrivacyInline />

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
    </section>
  );
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
      className="relative h-7 w-12 rounded-full shrink-0 border border-surface-border bg-surface-raised transition-colors"
    >
      {/* Sliding yellow knob — full circle = sun, crescent = moon */}
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full overflow-hidden shadow-sm transition-transform duration-300 ${
          isLight ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        {/* Yellow disc (emoji-like) */}
        <span
          className={`absolute inset-0 rounded-full ${
            isLight ? 'bg-amber-400' : 'bg-amber-300'
          }`}
        />
        {/* Carve a crescent in dark mode by overlaying a track-colored disc */}
        {!isLight && (
          <span className="absolute top-0 left-[7px] w-5 h-5 rounded-full bg-surface-raised" />
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
      className="w-9 h-9 shrink-0 rounded-full bg-surface-raised text-ink-300 hover:bg-forest-700 hover:text-on-accent flex items-center justify-center transition-colors"
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
