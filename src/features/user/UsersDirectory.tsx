// ============================================================================
// UsersDirectory — list of active users with a quick stats overview.
// Each row shows: avatar, name + coloured gender glyph, an "אני" / "שותף
// למסע" tag, the join date, and four numbers (trees, habits, score, visions).
// Tapping a row opens /user/:id for the full dashboard.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCircle,
  TreePine,
  Target,
  Star,
  BookOpen,
  ChevronLeft,
  CalendarDays,
  Handshake,
} from 'lucide-react';
import { fetchActiveProfiles } from './queries';
import { GenderIcon } from './GenderIcon';
import type { PublicProfileRow } from '../admin/types';

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
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised/40 transition-colors"
              >
                <Avatar url={row.avatar_url} />

                <div className="flex-1 min-w-0">
                  {/* Name + gender + identity tag */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm text-ink-100 font-semibold truncate">
                      {row.display_name || 'משתמש'}
                    </span>
                    <GenderIcon gender={row.gender} size={14} />
                    {row.is_me ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-forest-700/30 text-forest-400">
                        אני
                      </span>
                    ) : (
                      row.shared_with_me &&
                      row.habits_visibility !== 'public' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400">
                          <Handshake size={10} />
                          שותף למסע
                        </span>
                      )
                    )}
                  </div>

                  {/* Join date */}
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-500">
                    <CalendarDays size={10} />
                    <span dir="ltr">הצטרף {formatJoinDate(row.created_at)}</span>
                  </div>

                  {/* Stats */}
                  <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-ink-300">
                    <Stat icon={<TreePine size={12} />} value={row.trees_planted} suffix="עצים" />
                    <Stat icon={<Target size={12} />} value={row.habit_count} suffix="הרגלים" />
                    <Stat icon={<Star size={12} />} value={row.score} suffix="נק׳" />
                    <Stat icon={<BookOpen size={12} />} value={row.vision_count} suffix="כתיבות חזון" />
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

function Stat({
  icon,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  value: number;
  suffix: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-forest-500">{icon}</span>
      <span className="text-ink-100 font-medium tabular-nums">{value}</span>
      <span>{suffix}</span>
    </span>
  );
}

function Avatar({ url }: { url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-11 h-11 rounded-full object-cover border border-surface-border shrink-0"
      />
    );
  }
  return (
    <UserCircle size={44} strokeWidth={1.2} className="text-ink-300 shrink-0" />
  );
}

// e.g. 2026-01-01… → "1.1.26"
function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(-2);
  return `${d.getDate()}.${d.getMonth() + 1}.${yy}`;
}
