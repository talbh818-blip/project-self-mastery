// ============================================================================
// UserDetail — another user's profile dashboard.
// Header (avatar, name, gender, join date) + KPI numbers (trees, score,
// habits, vision writings). When the viewer is allowed to see the habits
// (public / shared), it also shows the habit list and a condensed success
// heatmap. Otherwise a "private" notice.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  UserCircle,
  ArrowRight,
  TreePine,
  Target,
  Star,
  BookOpen,
  Lock,
  CalendarDays,
} from 'lucide-react';
import { fetchUserDashboard, type UserDashboard } from '../features/user/queries';
import { GenderIcon } from '../features/user/GenderIcon';
import { MiniHeatmap } from '../features/user/MiniHeatmap';
import { HabitIcon } from '../features/habits/HabitIcon';

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

      {/* KPI numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={<TreePine size={18} />} value={data.trees_planted} label="עצים" />
        <Kpi icon={<Star size={18} />} value={data.score} label="ניקוד" />
        <Kpi icon={<Target size={18} />} value={data.habit_count} label="הרגלים" />
        <Kpi icon={<BookOpen size={18} />} value={data.vision_count} label="כתיבות חזון" />
      </div>

      {/* Habits + heatmap, or a privacy notice */}
      {data.can_view_habits ? (
        <>
          <div className="bg-surface-card rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink-100">ההרגלים של {name}</h2>
            {data.habits && data.habits.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {data.habits.map((h) => (
                  <li
                    key={h.id}
                    className="inline-flex items-center gap-1.5 bg-surface-raised rounded-full pl-3 pr-2 py-1.5"
                    style={{ color: h.color || undefined }}
                  >
                    <HabitIcon name={h.icon} size={16} strokeWidth={1.8} />
                    <span className="text-xs text-ink-100">{h.name}</span>
                  </li>
                ))}
              </ul>
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

function Kpi({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="bg-surface-card rounded-2xl px-4 py-3 flex items-center gap-3">
      <span className="text-forest-500 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-lg font-bold text-ink-100 tabular-nums leading-none">
          {value}
        </div>
        <div className="text-[11px] text-ink-300 mt-0.5">{label}</div>
      </div>
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
