// ============================================================================
// UsersDirectory — list of active users with a quick stats overview.
// Tapping a row navigates to /user/:id where the visibility-aware detail
// page renders. Powered by the list_active_profiles() RPC.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCircle, TreePine, ChevronLeft, Lock, Globe, Users } from 'lucide-react';
import { fetchActiveProfiles } from './queries';
import type { PublicProfileRow, Visibility } from '../admin/types';

export function UsersDirectory() {
  const [rows, setRows] = useState<PublicProfileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveProfiles()
      .then((data) => {
        if (cancelled) return;
        setRows(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'שגיאה בטעינת המשתמשים');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-surface-card rounded-2xl overflow-hidden">
      <header className="px-5 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-ink-100">משתתפים אקטיביים</h2>
        <p className="text-[11px] text-ink-300">
          סקירת ביצועים של אנשים אחרים באפליקציה
        </p>
      </header>

      {error && (
        <p className="text-xs text-red-400 bg-red-950/30 mx-5 my-2 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <p className="text-xs text-ink-300 px-5 py-4">טוען…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-xs text-ink-300 px-5 py-4">
          עדיין אין משתמשים אחרים — תהיה הראשון!
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-surface-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/user/${row.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-raised/40 transition-colors"
              >
                <Avatar url={row.avatar_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-100 font-medium truncate">
                      {row.display_name || 'משתמש'}
                    </span>
                    {row.is_me && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-forest-700/30 text-forest-400">
                        אני
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-ink-300 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <TreePine size={12} className="text-forest-500" />
                      {row.trees_planted} עצים
                    </span>
                    <VisibilityBadge
                      label="חזון"
                      value={row.vision_visibility}
                    />
                    <VisibilityBadge
                      label="הרגלים"
                      value={row.habits_visibility}
                    />
                  </div>
                </div>
                <ChevronLeft size={16} className="text-ink-500 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Avatar({ url }: { url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-10 h-10 rounded-full object-cover border border-surface-border shrink-0"
      />
    );
  }
  return (
    <UserCircle
      size={40}
      strokeWidth={1.2}
      className="text-ink-300 shrink-0"
    />
  );
}

function VisibilityBadge({ label, value }: { label: string; value: Visibility }) {
  const meta =
    value === 'public'
      ? { icon: <Globe size={10} />, cls: 'text-forest-500' }
      : value === 'specific'
      ? { icon: <Users size={10} />, cls: 'text-amber-400' }
      : { icon: <Lock size={10} />, cls: 'text-ink-500' };
  return (
    <span className={`inline-flex items-center gap-0.5 ${meta.cls}`}>
      {meta.icon}
      <span>{label}</span>
    </span>
  );
}
