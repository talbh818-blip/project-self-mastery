// ============================================================================
// Features screen ("פיצ'רים") — a hub of opt-in features. Each feature is a
// card in a 2-up grid with a checkbox to enable it and a tap to open its
// settings. The first real feature is per-habit notification reminders;
// the rest are "בקרוב" (coming soon) placeholders that show the layout.
//
// Notifications used to live inside the habit detail sheet — they were moved
// here so the Habits screen stays focused on tracking.
// ============================================================================
import { useState, type ReactNode } from 'react';
import { Bell, Check, ChevronRight, LayoutGrid, Rows3 } from 'lucide-react';
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
  // Grid (2-up cards) vs list (one wide row per feature). Persisted per device.
  const [cardLayout, setCardLayout] = useState<FeaturesView>(() =>
    loadFeaturesView(),
  );
  const changeCardLayout = (v: FeaturesView) => {
    setCardLayout(v);
    saveFeaturesView(v);
  };

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-100">פיצ'רים חדשים</h1>
            <p className="text-sm text-ink-300 mt-1">
              הפעל פיצ'רים והתאם אותם לעצמך. סמן ✓ כדי להפעיל, או הקש לכניסה
              להגדרות.
            </p>
          </div>
          <ViewToggle view={cardLayout} onChange={changeCardLayout} />
        </div>
      </header>

      {cardLayout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard
            glyph={<BellGlyph />}
            accent={BLOCK.green}
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
              glyph={f.glyph}
              accent={f.accent}
              title={f.title}
              description={f.description}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <FeatureRow
            glyph={<BellGlyph />}
            accent={BLOCK.green}
            title="התראות"
            description="תזכורות יזומות להרגלים — ימים ושעות לבחירתך"
            isNew={isWithinNewWindow(NOTIFICATIONS_NEW_UNTIL)}
            enabled={notifEnabled}
            onToggle={toggleNotifications}
            onOpen={() => setView('notifications')}
          />

          {COMING_SOON.map((f) => (
            <ComingSoonRow
              key={f.title}
              glyph={f.glyph}
              accent={f.accent}
              title={f.title}
              description={f.description}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coming-soon catalog (placeholders — no behaviour yet)
// ---------------------------------------------------------------------------

// "חדש" badge shows on a feature until this date (one month from its launch).
// After that it's just a normal feature.
const NOTIFICATIONS_NEW_UNTIL = '2026-07-19';

// Per-feature "extruded block" accents: a top-face gradient (light → mid) plus
// a darker `edge` colour rendered as a solid offset bottom shadow, so each tile
// reads as a chunky 3D block. Each feature gets its own hue — a varied set.
type BlockAccent = { from: string; to: string; edge: string };
const BLOCK: Record<'green' | 'red' | 'blue' | 'purple', BlockAccent> = {
  green: { from: '#5fc487', to: '#46955f', edge: '#2f6e48' },
  red: { from: '#ff8c7e', to: '#e85f5f', edge: '#b23b3b' },
  blue: { from: '#5aa6f0', to: '#3f7fe0', edge: '#2a5aa8' },
  purple: { from: '#9b86f2', to: '#6f54d4', edge: '#4e379e' },
};

const COMING_SOON: Array<{
  glyph: ReactNode;
  accent: BlockAccent;
  title: string;
  description: string;
}> = [
  { glyph: <HourglassGlyph />, accent: BLOCK.red, title: 'חוסם אפליקציות', description: 'הגבלת זמן מסך לאפליקציות מסיחות' },
  { glyph: <PageGlyph />, accent: BLOCK.blue, title: 'יומן יומי', description: 'רישום קצר על כל יום, נפרד מהחזון' },
  { glyph: <MeditationGlyph />, accent: BLOCK.purple, title: 'מדיטציה', description: 'תרגולי נשימה והרגעה מודרכים' },
];

function isWithinNewWindow(until: string): boolean {
  const end = new Date(until).getTime();
  return Number.isFinite(end) && Date.now() < end;
}

// ---------------------------------------------------------------------------
// View switcher — grid (2-up cards) vs list (one wide row each). Per-device.
// ---------------------------------------------------------------------------

type FeaturesView = 'grid' | 'list';
const VIEW_KEY = 'features-view';

function loadFeaturesView(): FeaturesView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function saveFeaturesView(v: FeaturesView): void {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* blocked — non-fatal */
  }
}

function ViewToggle({
  view,
  onChange,
}: {
  view: FeaturesView;
  onChange: (v: FeaturesView) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-xl border border-surface-border bg-surface-card p-0.5">
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-label="תצוגת רשת"
        aria-pressed={view === 'grid'}
        className={`p-1.5 rounded-lg transition-colors ${
          view === 'grid'
            ? 'bg-forest-700 text-cream-50'
            : 'text-ink-300 hover:text-ink-100'
        }`}
      >
        <LayoutGrid size={18} />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-label="תצוגת שורות"
        aria-pressed={view === 'list'}
        className={`p-1.5 rounded-lg transition-colors ${
          view === 'list'
            ? 'bg-forest-700 text-cream-50'
            : 'text-ink-300 hover:text-ink-100'
        }`}
      >
        <Rows3 size={18} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function FeatureCard({
  glyph,
  accent,
  title,
  description,
  isNew,
  enabled,
  onToggle,
  onOpen,
}: {
  glyph: ReactNode;
  accent: BlockAccent;
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
      {/* Enable checkbox — its own click target, doesn't open settings. */}
      <EnableCheckbox
        enabled={enabled}
        onToggle={onToggle}
        className="absolute top-3 left-3"
      />

      {isNew && <NewBadge />}

      <FeatureLogo glyph={glyph} accent={accent} />
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
  glyph,
  accent,
  title,
  description,
}: {
  glyph: ReactNode;
  accent: BlockAccent;
  title: string;
  description: string;
}) {
  return (
    <div className="relative rounded-2xl border border-surface-border bg-surface-card/50 p-4 flex flex-col gap-2 min-h-[150px]">
      <span className="absolute top-3 left-3 text-[10px] px-2 py-0.5 rounded-full bg-surface-raised text-ink-300 z-10">
        בקרוב
      </span>
      <span className="opacity-95">
        <FeatureLogo glyph={glyph} accent={accent} />
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

// ---------------------------------------------------------------------------
// List view — one wide row per feature
// ---------------------------------------------------------------------------

function FeatureRow({
  glyph,
  accent,
  title,
  description,
  isNew,
  enabled,
  onToggle,
  onOpen,
}: {
  glyph: ReactNode;
  accent: BlockAccent;
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
      className="w-full text-right rounded-2xl border border-surface-border bg-surface-card p-4 flex items-center gap-4 hover:border-forest-700/50 transition-colors"
    >
      <FeatureLogo glyph={glyph} accent={accent} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink-100 leading-tight">
            {title}
          </span>
          {isNew && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-forest-700 text-cream-50">
              חדש
            </span>
          )}
        </div>
        <p className="text-[12px] text-ink-300 mt-1 leading-snug">
          {description}
        </p>
      </div>
      <EnableCheckbox enabled={enabled} onToggle={onToggle} />
    </button>
  );
}

function ComingSoonRow({
  glyph,
  accent,
  title,
  description,
}: {
  glyph: ReactNode;
  accent: BlockAccent;
  title: string;
  description: string;
}) {
  return (
    <div className="w-full rounded-2xl border border-surface-border bg-surface-card/50 p-4 flex items-center gap-4">
      <span className="opacity-95">
        <FeatureLogo glyph={glyph} accent={accent} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink-100/80 leading-tight">
            {title}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-raised text-ink-300">
            בקרוב
          </span>
        </div>
        <p className="text-[12px] text-ink-300 mt-1 leading-snug">
          {description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** The enable checkbox — used in both grid (absolute-positioned) and list
 *  (inline) layouts. Stops propagation so it never opens the settings. */
function EnableCheckbox({
  enabled,
  onToggle,
  className = '',
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
}) {
  return (
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
      className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center border-2 transition-colors ${
        enabled
          ? 'bg-forest-700 border-forest-700 text-cream-50 shadow-sm'
          : 'border-ink-300/70 bg-surface-base text-transparent'
      } ${className}`}
    >
      <Check size={16} strokeWidth={3} />
    </span>
  );
}

/** An "extruded block" tile: a gradient top face with a solid darker bottom
 *  edge (the `0 Npx 0 edge` shadow) so it reads as a chunky 3D block, plus a
 *  soft cast shadow underneath. A custom white glyph sits on top. */
function FeatureLogo({ glyph, accent }: { glyph: ReactNode; accent: BlockAccent }) {
  return (
    <span
      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1"
      style={{
        background: `linear-gradient(160deg, ${accent.from}, ${accent.to})`,
        boxShadow: `0 5px 0 ${accent.edge}, 0 13px 14px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)`,
      }}
    >
      {glyph}
    </span>
  );
}

function NewBadge() {
  return (
    <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-forest-700 text-cream-50 z-10">
      חדש
    </span>
  );
}

// ---------------------------------------------------------------------------
// Custom feature glyphs — hand-drawn marks (not an icon library) with a bit of
// character, white-filled to sit on the coloured block tiles.
// ---------------------------------------------------------------------------

const GLYPH_STYLE = { filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.22))' } as const;

/** Bell with a small notification "badge" dot. */
function BellGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      <path d="M16 4.8c1.05 0 1.9.85 1.9 1.9v.6c2.9.85 5 3.55 5 6.75v3.25l1.45 2.5c.5.87-.12 1.95-1.12 1.95H8.77c-1 0-1.62-1.08-1.12-1.95L9 17.3v-3.25c0-3.2 2.1-5.9 5-6.75v-.6c0-1.05.85-1.9 2-1.9Z" />
      <path d="M13.1 24.7h5.8a2.9 2.9 0 0 1-5.8 0Z" />
      <circle cx="24" cy="8.2" r="2.9" />
    </svg>
  );
}

/** Hourglass — time / screen-time limit. */
function HourglassGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      <rect x="8" y="5" width="16" height="2.6" rx="1.3" />
      <path d="M11 8.4h10l-5 7.6 5 7.6H11l5-7.6Z" />
      <rect x="8" y="24.4" width="16" height="2.6" rx="1.3" />
    </svg>
  );
}

/** Page with a folded corner + text lines — a journal. */
function PageGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      <path d="M9.4 4.8h8l5.4 5.4V25.2A1.8 1.8 0 0 1 21 27H9.4A1.8 1.8 0 0 1 7.6 25.2V6.6A1.8 1.8 0 0 1 9.4 4.8Z" />
      <path d="M17.4 4.9 22.8 10.3H19.1A1.7 1.7 0 0 1 17.4 8.6Z" fillOpacity="0.45" />
      <rect x="10.7" y="15.2" width="9.8" height="1.7" rx="0.85" fillOpacity="0.8" />
      <rect x="10.7" y="19" width="9.8" height="1.7" rx="0.85" fillOpacity="0.8" />
      <rect x="10.7" y="22.8" width="6" height="1.7" rx="0.85" fillOpacity="0.8" />
    </svg>
  );
}

/** A seated figure in a meditation pose. */
function MeditationGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      <circle cx="16" cy="9" r="3.3" />
      <path d="M7.6 23.4c0-4.2 3.76-7.4 8.4-7.4s8.4 3.2 8.4 7.4c0 .9-.7 1.6-1.6 1.6H9.2c-.9 0-1.6-.7-1.6-1.6Z" />
      <circle cx="8.4" cy="21.6" r="1.5" />
      <circle cx="23.6" cy="21.6" r="1.5" />
    </svg>
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
