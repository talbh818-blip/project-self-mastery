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
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Emoji } from '../components/Emoji';
import { useFeatureActive } from '../features/settings/featureFlags';

export function Features() {
  const navigate = useNavigate();

  // Feature on/off is READ-ONLY here (synced per-user across devices); it's
  // toggled from INSIDE each feature, not from the card.
  const notifEnabled = useFeatureActive('notifications');

  const openNotifications = () => navigate('/features/notifications');

  return (
    <div className="max-w-md mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-ink-100">פיצ'רים חדשים</h1>
      </header>

      <div className="flex flex-col gap-3">
        <FeatureRow
          glyph={<BellGlyph />}
          accent={BLOCK.sky}
          title="התראות לטלפון"
          description="תזכורות יזומות להרגלים — ימים ושעות לבחירתך"
          isNew={isWithinNewWindow(NOTIFICATIONS_NEW_UNTIL)}
          enabled={notifEnabled}
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
// `badge` is the feature's representative icon colour — used to tint the "חדש"
// pill so it matches the icon (sky → תכלת, red → אדום, etc.).
type BlockAccent = { from: string; to: string; edge: string; badge: string };
const BLOCK: Record<'sky' | 'green' | 'red' | 'blue' | 'purple', BlockAccent> = {
  sky: { from: '#62c8f0', to: '#2f9fd4', edge: '#1f7aac', badge: '#62c8f0' },
  green: { from: '#5fc487', to: '#46955f', edge: '#2f6e48', badge: '#5fc487' },
  red: { from: '#ff8c7e', to: '#e85f5f', edge: '#b23b3b', badge: '#e85f5f' },
  blue: { from: '#5aa6f0', to: '#3f7fe0', edge: '#2a5aa8', badge: '#5aa6f0' },
  purple: { from: '#9b86f2', to: '#6f54d4', edge: '#4e379e', badge: '#9b86f2' },
};

const COMING_SOON: Array<{
  glyph: ReactNode;
  accent: BlockAccent;
  title: string;
  description: string;
}> = [
  { glyph: <LockGlyph />, accent: BLOCK.red, title: 'חוסם אפליקציות', description: 'הגבלת זמן מסך לאפליקציות מסיחות' },
  { glyph: <MeditationGlyph />, accent: BLOCK.purple, title: 'מדיטציה', description: 'תרגולי נשימה והרגעה מודרכים' },
];

function isWithinNewWindow(until: string): boolean {
  const end = new Date(until).getTime();
  return Number.isFinite(end) && Date.now() < end;
}

// ---------------------------------------------------------------------------
// Feature rows — one wide row per feature
// ---------------------------------------------------------------------------

function FeatureRow({
  glyph,
  accent,
  title,
  description,
  isNew,
  enabled,
  onOpen,
}: {
  glyph: ReactNode;
  accent: BlockAccent;
  title: string;
  description: string;
  isNew?: boolean;
  enabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-right rounded-2xl border bg-surface-card p-4 flex items-center gap-4 transition-colors ${
        enabled
          ? 'border-forest-700/60 shadow-[0_0_0_1px_rgba(86,160,109,0.25)]'
          : 'border-surface-border hover:border-forest-700/50'
      }`}
    >
      <FeatureLogo glyph={glyph} accent={accent} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink-100 leading-tight">
            {title}
          </span>
          <ActiveBadge enabled={enabled} />
          {isNew && <NewBadge color={accent.badge} />}
        </div>
        <p className="text-[12px] text-ink-300 mt-1 leading-snug">
          {description}
        </p>
      </div>
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

/** Active indicator — shows whether a feature is on. NOT a control; each
 *  feature is toggled from inside it (its settings screen / sheet). Used in
 *  both grid (absolute-positioned) and list (inline) layouts. */
function ActiveBadge({
  enabled,
  className = '',
}: {
  enabled: boolean;
  className?: string;
}) {
  return (
    <span
      aria-label={enabled ? 'פעיל' : 'כבוי'}
      className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        enabled
          ? 'bg-forest-700/20 text-forest-400'
          : 'bg-surface-raised text-ink-300'
      } ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          enabled
            ? 'bg-forest-400 shadow-[0_0_6px_1px_rgba(86,160,109,0.85)]'
            : 'bg-ink-300/70'
        }`}
      />
      {enabled ? 'פעיל' : 'כבוי'}
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

function NewBadge({ color, className = '' }: { color: string; className?: string }) {
  // Thin "outline pill" tinted to the feature's own icon colour, so "חדש" reads
  // as new without competing with the green "פעיל" status next to the title.
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${className}`}
      style={{ borderColor: color, color }}
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
    <svg viewBox="0 0 32 32" width="38" height="38" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      <path d="M16 4.8c1.05 0 1.9.85 1.9 1.9v.6c2.9.85 5 3.55 5 6.75v3.25l1.45 2.5c.5.87-.12 1.95-1.12 1.95H8.77c-1 0-1.62-1.08-1.12-1.95L9 17.3v-3.25c0-3.2 2.1-5.9 5-6.75v-.6c0-1.05.85-1.9 2-1.9Z" />
      <path d="M13.1 24.7h5.8a2.9 2.9 0 0 1-5.8 0Z" />
      <circle cx="24" cy="8.2" r="2.9" />
    </svg>
  );
}

/** Padlock — app blocker. */
function LockGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="38" height="38" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
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

/** A person seated in a meditation pose (head + arms resting on crossed legs). */
function MeditationGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="38" height="38" fill="#ffffff" style={GLYPH_STYLE} aria-hidden="true">
      {/* nudged down so the figure sits vertically centered in the viewBox */}
      <g transform="translate(0 1.9)">
        <circle cx="16" cy="8" r="3.3" />
        <path d="M16 12.8c-2.5 0-4.6 1.6-5.4 3.9-.4 1.1-1.3 1.9-2.4 2.3-1.4.5-1.9 2.2-.9 3.3.5.5 1.1.8 1.8.8h13.8c.7 0 1.3-.3 1.8-.8 1-1.1.5-2.8-.9-3.3-1.1-.4-2-1.2-2.4-2.3-.8-2.3-2.9-3.9-5.4-3.9Z" />
      </g>
    </svg>
  );
}

// The notifications settings screen now lives at /features/notifications
// (see src/screens/NotificationsSettings.tsx).
