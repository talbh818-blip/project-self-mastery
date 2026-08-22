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
  KanbanSquare,
  GripVertical,
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
import { DevBoardAdminPanel } from './DevBoardAdminPanel';
import { UserEditSheet } from './UserEditSheet';
import { useOpenTickets } from './OpenTicketsContext';
import { useVisionLayoutPref } from '../vision/useVisionLayoutPref';

type Row = {
  profile: Profile;
  activity: UserActivity | null;
};

type AdminTab = 'users' | 'feedback' | 'course' | 'questions' | 'dev';

// In-session cache of the loaded user rows so navigating away from /admin and
// back repaints instantly instead of flashing the loader. Memory-only (admin
// data); a full page reload starts fresh and revalidates.
let adminRowsCache: Row[] | null = null;

const LS_ACTIVE_TAB = 'admin-active-tab';

// Restore the last-open section so re-entering /admin lands where you left off
// (e.g. stay on "פידבק" instead of snapping back to "משתמשים"). Validated
// against the known sections so a removed tab can't wedge the screen.
function loadActiveTab(): AdminTab {
  try {
    const v = localStorage.getItem(LS_ACTIVE_TAB);
    if (v && SIDE_ITEMS.some((i) => i.id === v)) return v as AdminTab;
  } catch {
    // storage blocked — fall through to the default.
  }
  return 'users';
}

export function AdminScreen() {
  const [tab, setTab] = useState<AdminTab>(loadActiveTab);
  // Seed from the in-session cache so navigating back to /admin paints the
  // last-loaded users instantly (no loader flash); we revalidate on mount.
  const [rows, setRows] = useState<Row[] | null>(() => adminRowsCache);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  // Open feedback/support ticket count — drives the red badge on the "פידבק"
  // nav item so the owner sees waiting messages without leaving the tab.
  const { openTickets } = useOpenTickets();
  // Same desktop/mobile toggle Vision + Course use (bottom-nav "מחשב / נייד").
  // Desktop → wide two-column dashboard with a right sidebar; mobile → a
  // phone-width column (like the "משתמש" screen) with a horizontal top nav, so
  // the owner can preview both widths on one screen.
  const { mode } = useVisionLayoutPref();
  const desktop = mode === 'desktop';

  // User-arranged order of the nav sections (drag-and-drop on desktop),
  // persisted per-device and shared by both the sidebar and the mobile top bar.
  const [order, setOrder] = useState<AdminTab[]>(loadNavOrder);
  useEffect(() => {
    try {
      localStorage.setItem(LS_NAV_ORDER, JSON.stringify(order));
    } catch {
      // storage blocked — the order just won't persist across reloads.
    }
  }, [order]);

  // Remember the active section across visits (per-device).
  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_TAB, tab);
    } catch {
      // storage blocked — the tab just won't persist.
    }
  }, [tab]);

  // Log-score of the row being edited — the sheet displays log_score +
  // score_adjustment as the total in the "ניקוד" field so the admin sees
  // the actual number from the card, and translates back to an adjustment
  // delta on save.
  const editingLogScore = editing
    ? rows?.find((r) => r.profile.id === editing.id)?.activity?.log_score ?? 0
    : 0;

  const load = useCallback(async () => {
    try {
      const [profiles, activity] = await Promise.all([
        fetchAllProfiles(),
        fetchActivityRollup(),
      ]);
      const next = profiles.map((p) => ({
        profile: p,
        activity: activity.get(p.id) ?? null,
      }));
      adminRowsCache = next;
      setRows(next);
      setError(null);
    } catch (e) {
      console.error('[admin] load failed:', e);
      // A failed background revalidation must not wipe a working view — only
      // surface the error when there's nothing cached to show.
      if (adminRowsCache == null) setError(describeError(e, 'שגיאה בטעינה'));
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

  const content = (
    <>
      {tab === 'course' && <CourseAdminPanel />}
      {tab === 'feedback' && <FeedbackAdminPanel />}
      {tab === 'questions' && <VisionQuestionsAdminPanel />}
      {tab === 'dev' && <DevBoardAdminPanel />}
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
    </>
  );

  return (
    <section className="text-ink-100">
      {desktop ? (
        // Desktop: the section nav sits flush-RIGHT (it's the first child, so in
        // RTL it renders rightmost) as a full-height sidebar; the content claims
        // the width to its left.
        <div className="flex w-full gap-4">
          <AdminSidebar
            tab={tab}
            onSelect={setTab}
            openTickets={openTickets}
            order={order}
            setOrder={setOrder}
          />
          <div className="min-w-0 flex-1">{content}</div>
        </div>
      ) : (
        // Mobile: phone width (like the "משתמש" screen) with the SAME nav laid
        // out as a horizontal bar across the top; the active item shows its label.
        <div className="mx-auto w-full max-w-md">
          <AdminTopNav
            tab={tab}
            onSelect={setTab}
            openTickets={openTickets}
            order={order}
          />
          {content}
        </div>
      )}

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

// The admin sections, in their DEFAULT sidebar order (top → bottom).
// The actual on-screen order is user-arrangeable via drag-and-drop (desktop)
// and persisted per-device in localStorage under LS_NAV_ORDER.
const SIDE_ITEMS: { id: AdminTab; label: string; icon: LucideIcon }[] = [
  { id: 'users', label: 'משתמשים', icon: Users },
  { id: 'feedback', label: 'פידבק', icon: MessageSquare },
  { id: 'course', label: 'קורס', icon: PlayCircle },
  { id: 'questions', label: 'שאלות', icon: HelpCircle },
  { id: 'dev', label: 'פיתוח', icon: KanbanSquare },
];

const LS_NAV_ORDER = 'admin-nav-order';

// Resolve the saved order into a valid, complete list: keep saved ids that are
// still known (in saved order), then append any known ids the save is missing.
// This survives adding/removing a section without wiping the user's choice.
function loadNavOrder(): AdminTab[] {
  const known = SIDE_ITEMS.map((i) => i.id);
  try {
    const raw = localStorage.getItem(LS_NAV_ORDER);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(arr)) {
      const saved = arr.filter((id): id is AdminTab => known.includes(id as AdminTab));
      const missing = known.filter((id) => !saved.includes(id));
      return [...saved, ...missing];
    }
  } catch {
    // corrupt/blocked storage — fall through to the default order.
  }
  return known;
}

// Shared bits between the desktop sidebar and the mobile top bar: the icon +
// its notification badge. `active` drives icon weight; `badge` shows on פידבק.
function NavIcon({
  Icon,
  active,
  badge,
}: {
  Icon: LucideIcon;
  active: boolean;
  badge: number;
}) {
  return (
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
  );
}

// Desktop: vertical right-hand sidebar. Brand at the top, then the sections —
// each row draggable to reorder (grip handle as the cue). `order`/`setOrder`
// are owned by AdminScreen so the mobile bar stays in sync.
function AdminSidebar({
  tab,
  onSelect,
  openTickets,
  order,
  setOrder,
}: {
  tab: AdminTab;
  onSelect: (t: AdminTab) => void;
  openTickets: number;
  order: AdminTab[];
  setOrder: React.Dispatch<React.SetStateAction<AdminTab[]>>;
}) {
  const [dragId, setDragId] = useState<AdminTab | null>(null);

  // While dragging, live-reorder so the list settles as the pointer passes over
  // each item. Move the dragged id to sit where the hovered item currently is.
  const onDragOver = (e: React.DragEvent, overId: AdminTab) => {
    e.preventDefault(); // mark this element as a valid drop target
    if (dragId === null || dragId === overId) return;
    setOrder((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  };

  return (
    <aside className="w-56 shrink-0">
      {/* Full-height panel: sticky so the nav stays reachable while a long user
          list scrolls, and min-h fills the viewport so the sidebar runs from the
          top all the way down to just above the bottom nav — not a short card. */}
      <div className="sticky top-4 min-h-[calc(100vh-6rem)] rounded-2xl border border-surface-border bg-surface-card p-3">
        {/* Brand — logo + app name. */}
        <div className="flex items-center gap-2 px-2 py-2">
          <img src="/logo.png?v=5" alt="" className="h-8 w-8 shrink-0" />
          <span className="text-sm font-semibold leading-tight tracking-tight text-ink-100">
            פרויקט מחויבות לעצמי
          </span>
        </div>

        <div className="my-2 border-t border-surface-border" />

        <nav className="flex flex-col gap-1">
          {order.map((id) => {
            const item = SIDE_ITEMS.find((i) => i.id === id);
            if (!item) return null;
            const { label, icon: Icon } = item;
            const active = tab === id;
            const badge = id === 'feedback' ? openTickets : 0;
            const dragging = dragId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                title={label}
                aria-current={active ? 'page' : undefined}
                // HTML5 drag events fire on mouse; a plain click (no movement)
                // still selects the tab.
                draggable
                onDragStart={(e) => {
                  // Firefox only starts a drag once dataTransfer is set.
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', id);
                  setDragId(id);
                }}
                onDragOver={(e) => onDragOver(e, id)}
                onDragEnd={() => setDragId(null)}
                onDrop={(e) => e.preventDefault()}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  dragging ? 'opacity-50' : ''
                } ${
                  active
                    ? 'bg-forest-700 text-on-accent'
                    : 'text-ink-300 hover:bg-surface-raised hover:text-ink-100'
                }`}
              >
                <NavIcon Icon={Icon} active={active} badge={badge} />
                <span className="flex-1 text-right">{label}</span>
                {/* Drag handle — the visible "you can reorder me" cue. */}
                <GripVertical
                  size={16}
                  className="shrink-0 cursor-grab opacity-40 hover:opacity-80 active:cursor-grabbing"
                  aria-hidden
                />
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

// Mobile: the same sections as a horizontal bar across the top. Icon-only by
// default; the ACTIVE section expands to show its label (to the left of the
// icon in RTL). Sticky so it stays put while the user list scrolls. No drag —
// reordering is a desktop affordance — but it honours the order set there.
function AdminTopNav({
  tab,
  onSelect,
  openTickets,
  order,
}: {
  tab: AdminTab;
  onSelect: (t: AdminTab) => void;
  openTickets: number;
  order: AdminTab[];
}) {
  return (
    // Negative margins let the solid backdrop span edge-to-edge (cancelling the
    // page's px-3/sm:px-4) so scrolled content never shows through the gaps.
    <div className="sticky top-0 z-10 -mx-3 mb-3 bg-surface-base px-3 pb-2 pt-1 sm:-mx-4 sm:px-4">
      <nav className="flex items-center justify-around gap-1 rounded-2xl border border-surface-border bg-surface-card p-1.5">
        {order.map((id) => {
          const item = SIDE_ITEMS.find((i) => i.id === id);
          if (!item) return null;
          const { label, icon: Icon } = item;
          const active = tab === id;
          const badge = id === 'feedback' ? openTickets : 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={label}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-forest-700 text-on-accent'
                  : 'text-ink-300 hover:bg-surface-raised hover:text-ink-100'
              }`}
            >
              <NavIcon Icon={Icon} active={active} badge={badge} />
              {active && <span className="whitespace-nowrap">{label}</span>}
            </button>
          );
        })}
      </nav>
    </div>
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
