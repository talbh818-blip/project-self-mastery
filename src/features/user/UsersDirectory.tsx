// ============================================================================
// UsersDirectory — list of active users with a quick stats overview.
// Each row shows: avatar, name + coloured gender glyph, an "אני" / "שותף
// למסע" tag, the join date, and four numbers (trees, habits, score, visions).
// Tapping a row opens /user/:id for the full dashboard.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCircle, ChevronLeft, CalendarDays, Handshake } from 'lucide-react';
import { fetchActiveProfiles } from './queries';
import { GenderIcon } from './GenderIcon';
import { Emoji } from '../../components/Emoji';
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
      <header className="px-5 pt-4 pb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={shareOnWhatsApp}
          aria-label="שתף את האפליקציה בוואטסאפ"
          title="שתף בוואטסאפ"
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#25D366] text-white hover:brightness-95 active:scale-95 transition shrink-0"
        >
          <WhatsAppIcon size={16} />
        </button>
        <h2 className="text-sm font-semibold text-ink-100">משתתפים אקטיביים</h2>
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
                  {/* Name + gender + identity tag + join date — one line */}
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
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-100/70">
                      <CalendarDays size={11} />
                      <span dir="ltr">{formatJoinDate(row.created_at)}</span>
                    </span>
                  </div>

                  {/* Stats — packed 2×2 grid: trees · score / habits · vision */}
                  <div className="mt-1.5 grid grid-cols-[auto_auto] justify-start gap-x-5 gap-y-1 text-[11px] text-ink-300">
                    <Stat emoji="🌳" value={row.trees_planted} suffix="עצים" />
                    <Stat emoji="✨" value={row.score} suffix="נק׳" />
                    <Stat emoji="📊" value={row.habit_count} suffix="הרגלים" />
                    <Stat emoji="📖" value={row.vision_count} suffix="כתיבות חזון" />
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

// Opens WhatsApp with a pre-filled invite to the app (current origin as link).
function shareOnWhatsApp() {
  const url = window.location.origin;
  const text =
    `בוא/י להצטרף אליי לפרויקט מחויבות לעצמי 🧭 — בונים הרגלים טובים ומשמידים הרגלים רעים, ביחד!\n${url}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function Stat({
  emoji,
  value,
  suffix,
}: {
  emoji: string;
  value: number;
  suffix: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Emoji emoji={emoji} size={15} />
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
