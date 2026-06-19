// ============================================================================
// Features screen ("פיצ'רים") — a hub of opt-in features. Each feature is a
// card in a 2-up grid with a checkbox to enable it and a tap to open its
// settings. The first real feature is per-habit notification reminders;
// the rest are "בקרוב" (coming soon) placeholders that show the layout.
//
// Notifications used to live inside the habit detail sheet — they were moved
// here so the Habits screen stays focused on tracking.
// ============================================================================
import { useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Ban,
  NotebookPen,
  Flower2,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useHabitData } from '../features/habits/useHabitData';
import { HabitIcon } from '../features/habits/HabitIcon';
import { HabitNotificationsSheet } from '../features/habits/HabitNotificationsSheet';
import type { Habit } from '../features/habits/types';
import {
  HEBREW_DAY_LETTERS,
  isNotificationsFeatureEnabled,
  loadSettings,
  notificationsSupported,
  requestPermission,
  setNotificationsFeatureEnabled,
  type HabitNotificationSettings,
} from '../features/habits/notifications';

export function Features() {
  const { user } = useAuth();
  const data = useHabitData(user?.id ?? null);
  const activeHabits = data.habits.filter((h) => h.archived_at === null);

  const [view, setView] = useState<'hub' | 'notifications'>('hub');
  const [notifEnabled, setNotifEnabled] = useState(() =>
    isNotificationsFeatureEnabled(),
  );

  const toggleNotifications = async (next: boolean) => {
    setNotifEnabled(next);
    setNotificationsFeatureEnabled(next);
    // Enabling the feature is the natural moment to ask for the OS permission.
    if (next && notificationsSupported()) {
      await requestPermission();
    }
  };

  if (view === 'notifications') {
    return (
      <NotificationsFeatureSettings
        habits={activeHabits}
        enabled={notifEnabled}
        onToggle={toggleNotifications}
        onBack={() => setView('hub')}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-ink-100">פיצ'רים חדשים</h1>
        <p className="text-sm text-ink-300 mt-1">
          הפעל פיצ'רים והתאם אותם לעצמך. סמן ✓ כדי להפעיל, או הקש לכניסה
          להגדרות.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <FeatureCard
          icon={Bell}
          accent={ACCENT.green}
          title="התראות"
          description="תזכורות יזומות להרגלים — ימים ושעות לבחירתך"
          isNew={isWithinNewWindow(NOTIFICATIONS_NEW_UNTIL)}
          enabled={notifEnabled}
          onToggle={toggleNotifications}
          onOpen={() => setView('notifications')}
        />

        {COMING_SOON.map((f) => (
          <ComingSoonCard
            key={f.title}
            icon={f.icon}
            accent={f.accent}
            title={f.title}
            description={f.description}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coming-soon catalog (placeholders — no behaviour yet)
// ---------------------------------------------------------------------------

// "חדש" badge shows on a feature until this date (one month from its launch).
// After that it's just a normal feature.
const NOTIFICATIONS_NEW_UNTIL = '2026-07-19';

// Per-feature accent gradients (light → dark) for the icon tiles. Each feature
// gets its own hue so the grid reads as a varied, colorful set — not all one
// colour. Glyphs render white on top, "app-icon" style.
type Accent = { from: string; to: string };
const ACCENT: Record<'green' | 'red' | 'blue' | 'purple', Accent> = {
  green: { from: '#5fbf7e', to: '#2f7a4a' },
  red: { from: '#f47171', to: '#b23b3b' },
  blue: { from: '#4f9be6', to: '#275fa5' },
  purple: { from: '#9b7ef0', to: '#5b46b0' },
};

const COMING_SOON: Array<{
  icon: LucideIcon;
  accent: Accent;
  title: string;
  description: string;
}> = [
  { icon: Ban, accent: ACCENT.red, title: 'חוסם אפליקציות', description: 'הגבלת זמן מסך לאפליקציות מסיחות' },
  { icon: NotebookPen, accent: ACCENT.blue, title: 'יומן יומי', description: 'רישום קצר על כל יום, נפרד מהחזון' },
  { icon: Flower2, accent: ACCENT.purple, title: 'מדיטציה', description: 'תרגולי נשימה והרגעה מודרכים' },
];

function isWithinNewWindow(until: string): boolean {
  const end = new Date(until).getTime();
  return Number.isFinite(end) && Date.now() < end;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function FeatureCard({
  icon,
  accent,
  title,
  description,
  isNew,
  enabled,
  onToggle,
  onOpen,
}: {
  icon: LucideIcon;
  accent: Accent;
  title: string;
  description: string;
  isNew?: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative text-right rounded-2xl border border-surface-border bg-surface-card p-4 flex flex-col gap-2 min-h-[150px] hover:border-forest-700/50 transition-colors"
    >
      {/* Enable checkbox — its own click target, doesn't open settings. The
          unchecked box sits on the darker surface-base with a bright ring so
          it reads as a tappable target instead of blending into the card. */}
      <span
        role="checkbox"
        aria-checked={enabled}
        aria-label={enabled ? 'כבה את הפיצ\'ר' : 'הפעל את הפיצ\'ר'}
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!enabled);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onToggle(!enabled);
          }
        }}
        className={`absolute top-3 left-3 w-7 h-7 rounded-lg flex items-center justify-center border-2 transition-colors ${
          enabled
            ? 'bg-forest-700 border-forest-700 text-cream-50 shadow-sm'
            : 'border-ink-300/70 bg-surface-base text-transparent'
        }`}
      >
        <Check size={16} strokeWidth={3} />
      </span>

      {isNew && <NewBadge />}

      <FeatureLogo icon={icon} accent={accent} />
      <div className="mt-auto">
        <div className="text-[15px] font-semibold text-ink-100 leading-tight">
          {title}
        </div>
        <p className="text-[11px] text-ink-300 mt-1 leading-snug">
          {description}
        </p>
      </div>
    </button>
  );
}

function ComingSoonCard({
  icon,
  accent,
  title,
  description,
}: {
  icon: LucideIcon;
  accent: Accent;
  title: string;
  description: string;
}) {
  return (
    <div className="relative rounded-2xl border border-surface-border bg-surface-card/50 p-4 flex flex-col gap-2 min-h-[150px]">
      <span className="absolute top-3 left-3 text-[10px] px-2 py-0.5 rounded-full bg-surface-raised text-ink-300">
        בקרוב
      </span>
      <span className="opacity-90">
        <FeatureLogo icon={icon} accent={accent} />
      </span>
      <div className="mt-auto">
        <div className="text-[15px] font-semibold text-ink-100/80 leading-tight">
          {title}
        </div>
        <p className="text-[11px] text-ink-300 mt-1 leading-snug">
          {description}
        </p>
      </div>
    </div>
  );
}

/** A glossy "app-icon" tile: a per-feature colour gradient with a white glyph
 *  lifted off the surface for a designed, non-emoji look. */
function FeatureLogo({ icon: Icon, accent }: { icon: LucideIcon; accent: Accent }) {
  return (
    <span
      className="w-14 h-14 rounded-2xl flex items-center justify-center"
      style={{
        background: `linear-gradient(155deg, ${accent.from}, ${accent.to})`,
        boxShadow: `0 10px 18px -8px ${accent.to}b3, inset 0 1px 0 rgba(255,255,255,0.35)`,
      }}
    >
      <Icon
        size={28}
        strokeWidth={2}
        color="#ffffff"
        style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.30))' }}
      />
    </span>
  );
}

function NewBadge() {
  return (
    <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-forest-700 text-cream-50">
      חדש
    </span>
  );
}

// ---------------------------------------------------------------------------
// Notifications settings (entered by tapping the התראות card)
// ---------------------------------------------------------------------------

function NotificationsFeatureSettings({
  habits,
  enabled,
  onToggle,
  onBack,
}: {
  habits: Habit[];
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Habit | null>(null);

  return (
    <div className="max-w-md mx-auto">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -mr-1 text-ink-300 hover:text-ink-100"
          aria-label="חזרה"
        >
          <ChevronRight size={24} />
        </button>
        <h1 className="text-xl font-bold text-ink-100 flex items-center gap-2">
          <Bell size={20} className="text-forest-500" />
          התראות
        </h1>
      </header>

      {/* Master switch */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className="w-full mb-4 flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3.5 text-right"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink-100">
            הפעל התראות
          </span>
          <span className="block text-[11px] text-ink-300 leading-snug mt-0.5">
            כשכבוי — אף תזכורת לא תופיע, גם אם הוגדרה להרגל
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
            enabled ? 'bg-forest-700' : 'bg-surface-border'
          }`}
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? '-translate-x-5' : 'translate-x-0'
            }`}
          />
        </span>
      </button>

      <h2 className="text-sm font-medium text-ink-300 mb-2 px-1">
        תזכורות לפי הרגל
      </h2>

      {habits.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-surface-card px-4 py-8 text-center text-sm text-ink-300">
          אין הרגלים פעילים. הוסף הרגל במסך "הרגלים" כדי להגדיר לו תזכורת.
        </div>
      ) : (
        <ul className="space-y-2">
          {habits.map((habit) => {
            const s = loadSettings(habit.id);
            return (
              <li key={habit.id}>
                <button
                  type="button"
                  onClick={() => setSelected(habit)}
                  className={`w-full flex items-center gap-3 rounded-2xl border bg-surface-card px-3 py-3 text-right transition-colors ${
                    s.enabled
                      ? 'border-forest-700/40'
                      : 'border-surface-border'
                  } hover:border-forest-700/50`}
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-cream-50"
                    style={{
                      backgroundColor: hexWithAlpha(habit.color, 0.2),
                      border: `1px solid ${hexWithAlpha(habit.color, 0.45)}`,
                    }}
                  >
                    <HabitIcon name={habit.icon} size={20} strokeWidth={1.7} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink-100 truncate">
                      {habit.name}
                    </span>
                    <span className="block text-[11px] text-ink-300 mt-0.5">
                      {summarize(s)}
                    </span>
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      s.enabled
                        ? 'bg-forest-700/20 text-forest-400'
                        : 'bg-surface-raised text-ink-300'
                    }`}
                  >
                    {s.enabled ? 'פעיל' : 'כבוי'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <HabitNotificationsSheet
        open={selected !== null}
        habit={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarize(s: HabitNotificationSettings): string {
  if (!s.enabled) return 'אין תזכורת';
  const times = s.times.join(', ');
  const days =
    s.days.length === 7
      ? 'כל יום'
      : s.days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => HEBREW_DAY_LETTERS[d])
          .join(' ');
  return `${times} · ${days}`;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
