import { useCallback, useEffect, useState } from 'react';
import {
  ShieldOff,
  ShieldCheck,
  Trash2,
  TreePine,
  Sparkles,
  RefreshCw,
  Mail,
  Clock,
} from 'lucide-react';
import {
  deleteUserActivity,
  fetchActivityRollup,
  fetchAllProfiles,
  updateProfile,
  type UserActivity,
} from './queries';
import type { Profile } from './types';

type Row = {
  profile: Profile;
  activity: UserActivity | null;
};

export function AdminScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const handleEditTrees = async (p: Profile) => {
    const cur = String(p.trees_planted);
    const next = window.prompt(`עצים שתולים עבור ${p.display_name ?? p.email}:`, cur);
    if (next === null) return;
    const n = Number(next);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      window.alert('הזן מספר שלם אי-שלילי');
      return;
    }
    setBusy(true);
    try {
      await updateProfile(p.id, { trees_planted: n });
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
    } finally {
      setBusy(false);
    }
  };

  const handleEditScoreAdj = async (p: Profile) => {
    const cur = String(p.score_adjustment);
    const next = window.prompt(
      `התאמת ניקוד (מתווסף לניקוד המחושב) עבור ${p.display_name ?? p.email}:`,
      cur,
    );
    if (next === null) return;
    const n = Number(next);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      window.alert('הזן מספר שלם (חיובי או שלילי)');
      return;
    }
    setBusy(true);
    try {
      await updateProfile(p.id, { score_adjustment: n });
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">ניהול</h1>
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
        <div className="mb-3 rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {rows === null && !error && (
        <div className="text-sm text-ink-300 py-8 text-center">טוען…</div>
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
              onToggleBlocked={() => void handleToggleBlocked(profile)}
              onEditTrees={() => void handleEditTrees(profile)}
              onEditScoreAdj={() => void handleEditScoreAdj(profile)}
              onDeleteData={() => void handleDeleteData(profile)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UserCard({
  profile,
  activity,
  busy,
  onToggleBlocked,
  onEditTrees,
  onEditScoreAdj,
  onDeleteData,
}: {
  profile: Profile;
  activity: UserActivity | null;
  busy: boolean;
  onToggleBlocked: () => void;
  onEditTrees: () => void;
  onEditScoreAdj: () => void;
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
          <div className="w-10 h-10 rounded-full bg-forest-700 text-cream-50 text-sm font-bold flex items-center justify-center shrink-0">
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
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-forest-500/60 text-forest-400">
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

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionBtn
          onClick={onEditTrees}
          disabled={busy}
          icon={<TreePine size={14} />}
          label="ערוך עצים"
        />
        <ActionBtn
          onClick={onEditScoreAdj}
          disabled={busy}
          icon={<Sparkles size={14} />}
          label="ערוך ניקוד"
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
          ? 'border-forest-500/60 text-forest-400 hover:bg-forest-500/10'
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
