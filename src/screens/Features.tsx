// ============================================================================
// Features screen ("פיצ'רים") — a hub of opt-in features. Each feature is a
// card in a 2-up grid with a checkbox to enable it and a tap to open its
// settings. The first real feature is notification reminders (a free-form list
// of reminders); the rest are "בקרוב" (coming soon) placeholders.
//
// The notifications settings live on their own route (/features/notifications)
// so granting the OS permission — which can reload the page — lands the user
// back on the settings screen, not here on the hub.
// ============================================================================
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LayoutGrid, Rows3 } from 'lucide-react';
import { Emoji } from '../components/Emoji';
import {
  isNotificationsFeatureEnabled,
  notificationsSupported,
  requestPermission,
  setNotificationsFeatureEnabled,
} from '../features/notifications/delivery';

export function Features() {
  const navigate = useNavigate();

  const [notifEnabled, setNotifEnabled] = useState(isNotificationsFeatureEnabled);
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

  const openNotifications = () => navigate('/features/notifications');

  return (
    <div className="max-w-md mx-auto">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink-100">פיצ'רים חדשים</h1>
          <ViewToggle view={cardLayout} onChange={changeCardLayout} />
        </div>
      </header>

      {cardLayout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard
            glyph={<BellGlyph />}
            accent={BLOCK.sky}
            title="התראות"
            description="תזכורות יזומות להרגלים — ימים ושעות לבחירתך"
            isNew={isWithinNewWindow(NOTIFICATIONS_NEW_UNTIL)}
            enabled={notifEnabled}
            onToggle={toggleNotifications}
            onOpen={openNotifications}
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
            accent={BLOCK.sky}
            title="התראות"
            description="תזכורות יזומות להרגלים — ימים ושעות לבחירתך"
            isNew={isWithinNewWindow(NOTIFICATIONS_NEW_UNTIL)}
            enabled={notifEnabled}
            onToggle={toggleNotifications}
            onOpen={openNotifications}
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
const BLOCK: Record<'sky' | 'green' | 'red' | 'blue' | 'purple', BlockAccent> = {
  sky: { from: '#62c8f0', to: '#2f9fd4', edge: '#1f7aac' },
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
  { glyph: <LockGlyph />, accent: BLOCK.red, title: 'חוסם אפליקציות', description: 'הגבלת זמן מסך לאפליקציות מסיחות' },
  { glyph: <WritingGlyph />, accent: BLOCK.blue, title: 'כתיבה יומית', description: 'Journaling · רישום קצר ויומי, נפרד מהחזון' },
  { glyph: <LotusGlyph />, accent: BLOCK.purple, title: 'מדיטציה', description: 'תרגולי נשימה והרגעה מודרכים' },
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
    <div className="inline-flex shrink-0 gap-0.5 rounded-xl border border-surface-border bg-surface-card p-0.5">
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
        <LayoutGrid size={20} />
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
        <Rows3 size={20} />
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

      <FeatureLogo glyph={glyph} accent={accent} />
      <div className="mt-auto">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink-100 leading-tight">
            {title}
          </span>
          {isNew && <NewBadge />}
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
          {isNew && <NewBadge />}
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

function NewBadge({ className = '' }: { className?: string }) {
  // Dark-green pill so the cream "חדש" reads clearly (the old forest-700 was
  // too light for the cream text), plus a celebratory emoji.
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-forest-900 text-cream-50 ${className}`}
    >
      חדש
      <Emoji emoji="🎉" size={11} ariaLabel="" />
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

/** Padlock — app blocker. */
function LockGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      {/* shackle */}
      <path
        d="M11.8 14v-3a4.2 4.2 0 0 1 8.4 0v3"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* body with a keyhole cut out (the gradient shows through) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 13.2h10a2.8 2.8 0 0 1 2.8 2.8v8.2A2.8 2.8 0 0 1 21 27H11a2.8 2.8 0 0 1-2.8-2.8v-8.2A2.8 2.8 0 0 1 11 13.2Zm5 4.3a1.95 1.95 0 0 0-1.1 3.55V23a1.1 1.1 0 0 0 2.2 0v-1.95A1.95 1.95 0 0 0 16 17.5Z"
      />
    </svg>
  );
}

/** A page with a pencil writing on it — daily journaling. */
function WritingGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      {/* page */}
      <path d="M8.6 4.8h6.6l4 4V19.8A1.8 1.8 0 0 1 17.4 21.6H8.6A1.8 1.8 0 0 1 6.8 19.8V6.6A1.8 1.8 0 0 1 8.6 4.8Z" />
      <path d="M15.2 4.9 19.2 8.9H16.7A1.5 1.5 0 0 1 15.2 7.4Z" fillOpacity="0.4" />
      <rect x="9.6" y="11" width="7" height="1.5" rx="0.75" fillOpacity="0.78" />
      <rect x="9.6" y="14.2" width="7" height="1.5" rx="0.75" fillOpacity="0.78" />
      <rect x="9.6" y="17.4" width="4.4" height="1.5" rx="0.75" fillOpacity="0.78" />
      {/* pencil writing, overlapping the page corner and sticking out */}
      <g transform="rotate(45 20 21)">
        <rect x="18.1" y="13.4" width="3.8" height="11" rx="1.9" />
        <rect x="18.1" y="13.4" width="3.8" height="2.2" rx="1.1" fillOpacity="0.4" />
        <path d="M18.1 24.4h3.8l-1.9 3.3Z" />
      </g>
    </svg>
  );
}

/** A lotus flower — meditation / calm. */
function LotusGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      <path d="M16 6.5c1.8 2.2 1.8 6.3 0 9.8c-1.8-3.5-1.8-7.6 0-9.8Z" />
      <path d="M16 16.3C13.3 14.8 11.5 12 11 8.7c2.8 1.1 4.6 3.9 5 7.6Z" />
      <path d="M16 16.3C18.7 14.8 20.5 12 21 8.7c-2.8 1.1-4.6 3.9-5 7.6Z" />
      <path d="M15.6 17C12 16.2 9 13.8 7.4 10.4c3.8.3 7 2.8 8.2 6.6Z" />
      <path d="M16.4 17C20 16.2 23 13.8 24.6 10.4c-3.8.3-7 2.8-8.2 6.6Z" />
      <path d="M7 18.6c2.4 2.2 5.5 3.4 9 3.4s6.6-1.2 9-3.4c-2.6-1-5.7-1.5-9-1.5s-6.4.5-9 1.5Z" />
    </svg>
  );
}

// The notifications settings screen now lives at /features/notifications
// (see src/screens/NotificationsSettings.tsx).
