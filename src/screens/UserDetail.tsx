// ============================================================================
// UserDetail — another user's profile dashboard.
// Header (avatar, name, gender, join date) + KPI numbers (trees, score,
// habits, vision writings). When the viewer is allowed to see the habits
// (public / shared), it also shows the habit list and a condensed success
// heatmap. Otherwise a "private" notice.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UserCircle, ArrowRight, Lock, CalendarDays, Check } from 'lucide-react';
import {
  fetchUserDashboard,
  type UserDashboard,
  type DashboardHabit,
} from '../features/user/queries';
import { GenderIcon } from '../features/user/GenderIcon';
import { MiniHeatmap } from '../features/user/MiniHeatmap';
import { HabitIcon } from '../features/habits/HabitIcon';
import { Emoji } from '../components/Emoji';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<UserDashboard | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchUserDashboard(id)
      .then((row) => {
        if (!cancelled) setData(row);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'שגיאה בטעינת המשתמש');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <section className="pt-2 space-y-3">
        <BackButton onClick={() => navigate(-1)} />
        <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      </section>
    );
  }

  if (data === undefined) {
    return (
      <section className="pt-2 space-y-3">
        <BackButton onClick={() => navigate(-1)} />
        <p className="text-ink-300 text-sm">טוען…</p>
      </section>
    );
  }

  if (data === null) {
    return (
      <section className="pt-2 space-y-3">
        <BackButton onClick={() => navigate(-1)} />
        <p className="text-ink-300 text-sm">המשתמש לא נמצא.</p>
      </section>
    );
  }

  const name = data.display_name || 'משתמש';
  const daysOnJourney = daysSince(data.created_at);

  return (
    <section className="pt-1 pb-6 space-y-4">
      <Link
        to="/user"
        className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
      >
        <ArrowRight size={16} />
        חזרה למשתתפים
      </Link>

      {/* Header */}
      <div className="bg-surface-card rounded-2xl p-5 flex items-center gap-4">
        {data.avatar_url ? (
          <img
            src={data.avatar_url}
            alt=""
            className="w-20 h-20 rounded-full object-cover border-2 border-surface-border shrink-0"
          />
        ) : (
          <UserCircle size={80} strokeWidth={1.2} className="text-ink-300 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-semibold text-ink-100 truncate">{name}</p>
            <GenderIcon gender={data.gender} size={16} />
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-300">
            <CalendarDays size={12} />
            <span dir="ltr">הצטרף {formatJoinDate(data.created_at)}</span>
          </div>
        </div>
      </div>

      {/* KPI numbers — one row: journey time · trees · score · visions */}
      <div className="grid grid-cols-4 gap-2">
        <Kpi
          icon={
            <img
              src="/logo.png?v=3"
              alt=""
              className="w-6 h-6 object-contain"
            />
          }
          value={
            <>
              {daysOnJourney}
              <span className="text-[9px] font-normal text-ink-300 mr-0.5">
                ימים
              </span>
            </>
          }
          label="זמן במסע"
        />
        <Kpi icon={<Emoji emoji="🌳" size={24} />} value={data.trees_planted} label="עצים" />
        <Kpi icon={<Emoji emoji="✨" size={24} />} value={data.score} label="ניקוד" />
        <Kpi icon={<Emoji emoji="📖" size={24} />} value={data.vision_count} label="כתיבות חזון" />
      </div>

      {/* Habits + heatmap, or a privacy notice */}
      {data.can_view_habits ? (
        <>
          <div className="bg-surface-card rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink-100">ההרגלים של {name}</h2>
            {data.habits && data.habits.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {data.habits.map((h) => (
                  <UserHabitCard key={h.id} habit={h} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-300">אין הרגלים פעילים כרגע.</p>
            )}
          </div>

          <div className="bg-surface-card rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink-100">עקביות (חצי שנה אחרונה)</h2>
            <MiniHeatmap
              daily={data.daily ?? []}
              habitCount={Math.max(1, data.habit_count)}
            />
            <p className="text-[10px] text-ink-500">
              כל ריבוע = יום; ככל שירוק יותר, כך סומנו יותר הרגלים בהצלחה.
            </p>
          </div>
        </>
      ) : (
        <div className="bg-surface-card rounded-2xl p-5 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center shrink-0">
            <Lock size={18} className="text-ink-300" />
          </span>
          <div>
            <p className="text-sm text-ink-100 font-medium">ההרגלים פרטיים</p>
            <p className="text-xs text-ink-300">
              {name} לא שיתף/ה את ההרגלים איתך.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// One habit card — mirrors the owner's data-dashboard card so the admin sees
// the same info: frequency, marked-count, success %, points · start date.
function UserHabitCard({ habit }: { habit: DashboardHabit }) {
  const iconTileStyle: React.CSSProperties = {
    backgroundColor: hexWithAlpha(habit.color, 0.18),
    color: 'white',
  };
  const freqText = (() => {
    const { frequency_period: p, frequency_target: t } = habit;
    if (p === 'daily' && t === 1) return null;
    const period = p === 'daily' ? 'ביום' : p === 'weekly' ? 'בשבוע' : 'בחודש';
    const times = t === 1 ? 'פעם' : t === 2 ? 'פעמיים' : `${t} פעמים`;
    return `${times} ${period}`;
  })();
  const points = habit.total_points;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-2.5 flex flex-col items-center text-center gap-1.5 min-w-0">
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={iconTileStyle}
      >
        <HabitIcon name={habit.icon} size={20} strokeWidth={1.8} />
      </span>
      <div className="text-[11px] font-medium text-ink-100 truncate w-full leading-tight">
        {habit.name}
      </div>
      {freqText && (
        <div className="text-[9px] text-white/60 leading-none">{freqText}</div>
      )}
      <div className="inline-flex items-center gap-1 text-[10px] text-white/70 leading-none">
        <Check size={12} strokeWidth={2.5} className="text-forest-400 shrink-0" />
        סומן {habit.v_count} {habit.v_count === 1 ? 'פעם' : 'פעמים'}
      </div>
      <div className="text-base font-bold leading-none text-ink-100">
        <span className="tabular-nums">{habit.success_pct ?? 0}%</span>
        <span className="text-[10px] font-normal text-white/80 mr-1">הצלחה</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] leading-none">
        <span
          className={`font-medium tabular-nums ${
            points > 0
              ? 'text-forest-500'
              : points < 0
              ? 'text-red-400'
              : 'text-white/70'
          }`}
        >
          {points > 0 ? `+${points}` : points} נק׳
        </span>
        {habit.start_date && (
          <>
            <span className="text-ink-500">·</span>
            <span className="text-white/70">מ-{formatShortDate(habit.start_date)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// "YYYY-MM-DD" → "d.m.yy" (local, no TZ drift).
function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d}.${m}.${String(y).slice(-2)}`;
}

// Mix a hex color with an alpha → rgba() string. Accepts "#rrggbb".
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function Kpi({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="bg-surface-card rounded-2xl px-1.5 py-3 flex flex-col items-center gap-1 text-center">
      <span className="shrink-0">{icon}</span>
      <div className="text-base font-bold text-ink-100 tabular-nums leading-none">
        {value}
      </div>
      <div className="text-[10px] text-ink-300 leading-tight">{label}</div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
    >
      <ArrowRight size={16} />
      חזרה
    </button>
  );
}

function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(-2);
  return `${d.getDate()}.${d.getMonth() + 1}.${yy}`;
}

// Whole days since joining (day 1 = the join day itself).
function daysSince(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86400000) + 1);
}
