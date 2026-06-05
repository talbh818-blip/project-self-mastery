// ============================================================================
// UserDetail — visibility-aware profile of another user.
// Reached by tapping a row in the UsersDirectory. Renders the safe fields,
// plus banners that explain what's private vs. visible to the caller.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  UserCircle,
  ArrowRight,
  TreePine,
  BookOpen,
  Target,
  Lock,
  Globe,
  Users,
} from 'lucide-react';
import { fetchPublicProfile } from '../features/user/queries';
import type { PublicProfileDetail, Visibility } from '../features/admin/types';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicProfileDetail | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchPublicProfile(id)
      .then((row) => {
        if (cancelled) return;
        setData(row);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'שגיאה בטעינת המשתמש');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (data === undefined && !error) {
    return (
      <section className="pt-2">
        <p className="text-ink-300 text-sm">טוען…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="pt-2 space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
        >
          <ArrowRight size={16} />
          חזרה
        </button>
        <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      </section>
    );
  }

  if (data === null) {
    return (
      <section className="pt-2 space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
        >
          <ArrowRight size={16} />
          חזרה
        </button>
        <p className="text-ink-300 text-sm">המשתמש לא נמצא.</p>
      </section>
    );
  }

  return (
    <section className="pt-1 pb-6 space-y-4">
      <Link
        to="/user"
        className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100"
      >
        <ArrowRight size={16} />
        חזרה למשתתפים
      </Link>

      {/* Profile header */}
      <div className="bg-surface-card rounded-2xl p-5 flex items-center gap-4">
        {data.avatar_url ? (
          <img
            src={data.avatar_url}
            alt=""
            className="w-20 h-20 rounded-full object-cover border-2 border-surface-border shrink-0"
          />
        ) : (
          <UserCircle
            size={80}
            strokeWidth={1.2}
            className="text-ink-300 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-ink-100 truncate">
            {data.display_name || 'משתמש'}
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-ink-300">
            <span className="inline-flex items-center gap-1">
              <TreePine size={14} className="text-forest-500" />
              {data.trees_planted} עצים שתולים
            </span>
          </div>
        </div>
      </div>

      {/* Vision section */}
      <ResourceSection
        icon={<BookOpen size={18} />}
        title="חזון"
        visibility={data.vision_visibility}
        canView={data.can_view_vision}
        emptyHint="המשתמש בחר להשאיר את החזון פרטי."
        sharedHint="המשתמש שיתף איתך את החזון."
        publicHint="החזון של המשתמש פתוח לכולם."
      >
        {/* Real content will land in V2 — when the vision-share read flow lands. */}
        <p className="text-xs text-ink-300">
          {data.can_view_vision
            ? 'תוכן החזון יופיע כאן בקרוב.'
            : 'אין גישה לתוכן.'}
        </p>
      </ResourceSection>

      {/* Habits section */}
      <ResourceSection
        icon={<Target size={18} />}
        title="הרגלים"
        visibility={data.habits_visibility}
        canView={data.can_view_habits}
        emptyHint="המשתמש בחר להשאיר את ההרגלים פרטיים."
        sharedHint="המשתמש שיתף איתך את ההרגלים."
        publicHint="ההרגלים של המשתמש פתוחים לכולם."
      >
        <p className="text-xs text-ink-300">
          {data.can_view_habits
            ? 'סקירת ההרגלים תופיע כאן בקרוב.'
            : 'אין גישה לתוכן.'}
        </p>
      </ResourceSection>
    </section>
  );
}

function ResourceSection({
  icon,
  title,
  visibility,
  canView,
  children,
  emptyHint,
  sharedHint,
  publicHint,
}: {
  icon: React.ReactNode;
  title: string;
  visibility: Visibility;
  canView: boolean;
  children: React.ReactNode;
  emptyHint: string;
  sharedHint: string;
  publicHint: string;
}) {
  const banner =
    visibility === 'public'
      ? { icon: <Globe size={14} />, text: publicHint, cls: 'text-forest-500' }
      : visibility === 'specific'
      ? canView
        ? { icon: <Users size={14} />, text: sharedHint, cls: 'text-amber-400' }
        : { icon: <Lock size={14} />, text: emptyHint, cls: 'text-ink-500' }
      : { icon: <Lock size={14} />, text: emptyHint, cls: 'text-ink-500' };

  return (
    <div className="bg-surface-card rounded-2xl p-5 space-y-2">
      <header className="flex items-center gap-2">
        <span className="text-forest-500">{icon}</span>
        <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      </header>
      <p className={`text-[11px] flex items-center gap-1 ${banner.cls}`}>
        {banner.icon}
        {banner.text}
      </p>
      {canView && <div className="pt-1">{children}</div>}
    </div>
  );
}
