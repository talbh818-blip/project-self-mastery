import { useCallback, useEffect, useState } from 'react';
import {
  ShieldOff,
  ShieldCheck,
  Trash2,
  Pencil,
  RefreshCw,
  Mail,
  Clock,
  Users,
  MessageSquare,
  PlayCircle,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  deleteUserActivity,
  fetchActivityRollup,
  fetchAllProfiles,
  updateProfile,
  type ProfileAdminPatch,
  type UserActivity,
} from './queries';
import type { Profile } from './types';
import { CompassLoader } from '../../components/CompassLoader';
import { CourseAdminPanel } from './CourseAdminPanel';
import { FeedbackAdminPanel } from './FeedbackAdminPanel';
import { VisionQuestionsAdminPanel } from './VisionQuestionsAdminPanel';
import { UserEditSheet } from './UserEditSheet';
import { useOpenTickets } from './OpenTicketsContext';

type Row = {
  profile: Profile;
  activity: UserActivity | null;
};

type AdminTab = 'users' | 'feedback' | 'course' | 'questions';

export function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>('users');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  // Open feedback/support ticket count — drives the red badge on the "פידבק"
  // sidebar item so the owner sees waiting messages without leaving the tab.
  const { openTickets } = useOpenTickets();

  // Log-score of the row being edited — the sheet displays log_score +
  // score_adjustment as the total in the "ניקוד" field so the admin sees
  // the actual number from the card, and translates back to an adjustment
  // delta on save.
  const editingLogScore = editing
    ? rows?.find((r) => r.profile.id === editing.id)?.activity?.log_score ?? 0
    : 0;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profiles, activity] = await Promise.all([
        fetchAllProfiles(),
        fetchActivityRollup(),
      ]);
      setRows(
        profiles.map((p) => ({
          profile: p,
          activity: activity.get(p.id) ?? null,
        })),
      );
    } catch (e) {
      console.error('[admin] load failed:', e);
      setError(describeError(e, 'שגיאה בטעינה'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleBlocked = async (p: Profile) => {
    setBusy(true);
    try {
      await updateProfile(p.id, { blocked: !p.blocked });
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
    } finally {
      setBusy(false);
    }
  };

  // Full edit goes through UserEditSheet — name / email / phone / theme /
  // gender / trees / score adjustment / blocked. Privacy fields (vision +
  // habits visibility) are intentionally NOT exposed.
  const handleSaveEdit = async (patch: ProfileAdminPatch) => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateProfile(editing.id, patch);
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
      throw e; // let the sheet keep the form open on failure
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteData = async (p: Profile) => {
    const name = p.display_name ?? p.email ?? p.id;
    if (
      !window.confirm(
        `למחוק את כל נתוני ההרגלים, הסימונים והסלוטים של ${name}?\n` +
          `החשבון יישאר קיים — רק הנתונים יימחקו. אי אפשר לבטל.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteUserActivity(p.id);
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה במחיקה'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="text-ink-100">
      {/* Two-column dashboard: a right-hand sidebar (RTL → first child renders
          rightmost) carries the brand + section nav; content sits to its left.
          On phones the sidebar collapses to a slim icon rail. */}
      <div className="mx-auto flex w-full max-w-5xl gap-4 sm:gap-6">
        <AdminSidebar tab={tab} onSelect={setTab} openTickets={openTickets} />

        <div className="min-w-0 flex-1">
          {tab === 'course' && <CourseAdminPanel />}
          {tab === 'feedback' && <FeedbackAdminPanel />}
          {tab === 'questions' && <VisionQuestionsAdminPanel />}
          {tab === 'users' && (
            <>
              {/* Refresh button — sits inside the users panel since the other
                  panels own their own refresh internally. */}
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 disabled:opacity-50"
                  aria-label="רענן"
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

              {rows === null && !error && (
                <div className="py-8">
                  <CompassLoader size="md" />
                </div>
              )}

              {rows && rows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
                  אין משתמשים עדיין.
                </div>
              )}

              {rows && rows.length > 0 && (
                <ul className="space-y-3">
                  {rows.map(({ profile, activity }) => (
                    <UserCard
                      key={profile.id}
                      profile={profile}
                      activity={activity}
                      busy={busy}
                      onEdit={() => setEditing(profile)}
                      onToggleBlocked={() => void handleToggleBlocked(profile)}
                      onDeleteData={() => void handleDeleteData(profile)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      <UserEditSheet
        open={editing !== null}
        profile={editing}
        logScore={editingLogScore}
        submitting={busy}
        onClose={() => setEditing(null)}
        onSubmit={handleSaveEdit}
      />
    </section>
  );
}

// The four admin sections, in sidebar order (top → bottom).
const SIDE_ITEMS: { id: AdminTab; label: string; icon: LucideIcon }[] = [
  { id: 'users', label: 'משתמשים', icon: Users },
  { id: 'feedback', label: 'פידבק', icon: MessageSquare },
  { id: 'course', label: 'קורס', icon: PlayCircle },
  { id: 'questions', label: 'שאלות', icon: HelpCircle },
];

function AdminSidebar({
  tab,
  onSelect,
  openTickets,
}: {
  tab: AdminTab;
  onSelect: (t: AdminTab) => void;
  openTickets: number;
}) {
  return (
    <aside className="w-14 shrink-0 sm:w-56">
      {/* Sticky so the nav stays reachable while a long user list scrolls. */}
      <div className="sticky top-4 rounded-2xl border border-surface-border bg-surface-card p-2 sm:p-3">
        {/* Brand — logo only on the phone rail, logo + name on wider screens. */}
        <div className="flex items-center justify-center gap-2 px-1 py-2 sm:justify-start sm:px-2">
          <img src="/logo.png?v=5" alt="" className="h-8 w-8 shrink-0" />
          <span className="hidden text-sm font-semibold leading-tight tracking-tight text-ink-100 sm:block">
            פרויקט מחויבות לעצמי
          </span>
        </div>

        <div className="my-2 border-t border-surface-border" />

        <nav className="flex flex-col gap-1">
          {SIDE_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const badge = id === 'feedback' ? openTickets : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                title={label}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center justify-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium transition-colors sm:justify-start sm:px-3 ${
                  active
                    ? 'bg-forest-700 text-on-accent'
                    : 'text-ink-300 hover:bg-surface-raised hover:text-ink-100'
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                  {badge > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-surface-card"
                      aria-label={`${badge} ממתינים למענה`}
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="hidden sm:block">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function UserCard({
  profile,
  activity,
  busy,
  onEdit,
  onToggleBlocked,
  onDeleteData,
}: {
  profile: Profile;
  activity: UserActivity | null;
  busy: boolean;
  onEdit: () => void;
  onToggleBlocked: () => void;
  onDeleteData: () => void;
}) {
  const name = profile.display_name ?? profile.email ?? profile.id.slice(0, 8);
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const totalScore = (activity?.log_score ?? 0) + profile.score_adjustment;
  const lastSeen = profile.last_seen_at ? relativeFromNow(profile.last_seen_at) : 'מעולם לא';
  const activeWithin7d = profile.last_seen_at
    ? Date.now() - new Date(profile.last_seen_at).getTime() < 7 * 24 * 3600 * 1000
    : false;

  return (
    <li
      className={`rounded-2xl border bg-surface-card px-4 py-3 ${
        profile.blocked ? 'border-red-500/60' : 'border-surface-border'
      }`}
    >
      {/* Header: avatar + name + status */}
      <div className="flex items-center gap-3">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-forest-700 text-on-accent text-sm font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-100 truncate">{name}</span>
            {profile.blocked && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/60 text-red-400">
                חסום
              </span>
            )}
            {!profile.blocked && activeWithin7d && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-forest-500/60 text-forest-700">
                פעיל
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-ink-300 truncate">
            <Mail size={11} />
            <span className="truncate">{profile.email ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="ניקוד" value={totalScore} hint={profile.score_adjustment !== 0 ? `כולל ${profile.score_adjustment >= 0 ? '+' : ''}${profile.score_adjustment}` : undefined} />
        <Stat label="עצים" value={profile.trees_planted} />
        <Stat label="הרגלים" value={activity?.habit_count ?? 0} />
        <Stat label="סימוני V" value={activity?.v_count ?? 0} />
      </div>

      <div className="mt-2 flex items-center gap-1 text-[11px] text-ink-300">
        <Clock size={11} />
        <span>נצפה לאחרונה: {lastSeen}</span>
      </div>

      {/* Actions
          ערוך — full edit sheet for every editable field (name, email,
          phone, gender, theme, trees, score adjustment, blocked).
          חסום / בטל חסימה — one-click toggle kept as a shortcut next to
          the row so the most common moderation action stays fast.
          מחק נתונים — separate because it's destructive. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionBtn
          onClick={onEdit}
          disabled={busy}
          icon={<Pencil size={14} />}
          label="ערוך"
        />
        <ActionBtn
          onClick={onToggleBlocked}
          disabled={busy}
          icon={profile.blocked ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
          label={profile.blocked ? 'בטל חסימה' : 'חסום'}
          variant={profile.blocked ? 'positive' : 'warn'}
        />
        <ActionBtn
          onClick={onDeleteData}
          disabled={busy}
          icon={<Trash2 size={14} />}
          label="מחק נתונים"
          variant="danger"
        />
      </div>
    </li>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-raised px-2 py-1.5">
      <div className="text-base font-bold tabular-nums text-ink-100 leading-tight">{value}</div>
      <div className="text-[10px] text-ink-300 leading-tight">{label}</div>
      {hint && <div className="text-[9px] text-ink-300/80 leading-tight mt-0.5">{hint}</div>}
    </div>
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
  variant?: 'default' | 'danger' | 'warn' | 'positive';
}) {
  const styles =
    variant === 'danger'
      ? 'border-red-500/60 text-red-400 hover:bg-red-500/10'
      : variant === 'warn'
        ? 'border-amber-500/60 text-amber-400 hover:bg-amber-500/10'
        : variant === 'positive'
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

// Supabase errors are plain objects, not Error instances — `e instanceof Error`
// is false for them. Pull together whatever fields look useful so the admin
// can read the real failure (RLS denial, missing column, etc.).
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

function relativeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'כעת';
  if (diffSec < 3600) return `לפני ${Math.floor(diffSec / 60)} ד׳`;
  if (diffSec < 86400) return `לפני ${Math.floor(diffSec / 3600)} שע׳`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  if (months < 12) return `לפני ${months} ח׳`;
  return `לפני ${Math.floor(months / 12)} שנים`;
}
