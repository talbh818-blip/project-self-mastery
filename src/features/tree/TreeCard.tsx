import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Emoji } from '../../components/Emoji';
import { useCurrentProfile } from '../admin/ProfileContext';
import { supabase } from '../../lib/supabase';

// ── Growth configuration ─────────────────────────────────────────────────────

/**
 * Cycle-score required to fully grow a tree, by tree index (0-based).
 * First two trees have a "discount" to give early momentum; from the third
 * tree on the cycle stabilises at 650.
 */
const CYCLE_TARGETS = [200, 400] as const;
const DEFAULT_CYCLE_TARGET = 650;

function cycleTargetFor(treeIndex: number): number {
  return CYCLE_TARGETS[treeIndex] ?? DEFAULT_CYCLE_TARGET;
}

/** Relative stage thresholds as fractions of the cycle target. */
const STAGE_RATIOS = [0, 100 / 650, 250 / 650, 450 / 650, 1] as const;

/** Stage thresholds scaled to a given cycle target (index = stage). */
function stageThresholdsFor(cycleTarget: number): number[] {
  return STAGE_RATIOS.map((r) => Math.round(r * cycleTarget));
}

const STAGE_LABELS = ['זרע', 'שתיל', 'עץ צעיר', 'עץ גדל', 'עץ בשל'] as const;

type Stage = 0 | 1 | 2 | 3 | 4;

function stageFor(pts: number, thresholds: number[]): Stage {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (pts >= thresholds[i]) return i as Stage;
  }
  return 0;
}

// ── SVG Tree Illustrations ───────────────────────────────────────────────────

/** Stage 0 — tiny sprout just breaking soil */
function Sprout() {
  return (
    <svg viewBox="15 5 90 95" width="100%" height="100%" aria-hidden>
      <ellipse cx={60} cy={89} rx={18} ry={5} fill="#3D6B4F" opacity={0.5} />
      {/* stem */}
      <line x1={60} y1={89} x2={60} y2={64} stroke="#8B6914" strokeWidth={2.5} strokeLinecap="round" />
      {/* two seed leaves */}
      <ellipse cx={49} cy={67} rx={12} ry={6.5} fill="#4ED371" transform="rotate(-38 49 67)" />
      <ellipse cx={71} cy={67} rx={12} ry={6.5} fill="#27AE92" transform="rotate(38 71 67)" />
    </svg>
  );
}

/** Stage 1 — small seedling with branching leaves */
function Seedling() {
  return (
    <svg viewBox="15 5 90 95" width="100%" height="100%" aria-hidden>
      <ellipse cx={60} cy={90} rx={22} ry={5} fill="#3D6B4F" opacity={0.5} />
      {/* main stem */}
      <line x1={60} y1={90} x2={60} y2={54} stroke="#8B6914" strokeWidth={3} strokeLinecap="round" />
      {/* side branches */}
      <line x1={60} y1={74} x2={46} y2={66} stroke="#8B6914" strokeWidth={2} strokeLinecap="round" />
      <line x1={60} y1={74} x2={74} y2={66} stroke="#8B6914" strokeWidth={2} strokeLinecap="round" />
      {/* branch leaf clusters */}
      <ellipse cx={42} cy={63} rx={10} ry={6} fill="#4ED371" opacity={0.85} />
      <ellipse cx={78} cy={63} rx={10} ry={6} fill="#27AE92" opacity={0.85} />
      {/* upper leaves */}
      <ellipse cx={50} cy={60} rx={14} ry={7.5} fill="#4ED371" transform="rotate(-25 50 60)" />
      <ellipse cx={70} cy={60} rx={14} ry={7.5} fill="#2ECC71" transform="rotate(25 70 60)" />
      <ellipse cx={60} cy={53} rx={12} ry={7} fill="#27AE92" />
    </svg>
  );
}

/** Stage 2 — sapling with a short trunk and round canopy */
function Sapling() {
  return (
    <svg viewBox="15 5 90 95" width="100%" height="100%" aria-hidden>
      <ellipse cx={60} cy={91} rx={26} ry={6} fill="#3D6B4F" opacity={0.45} />
      {/* trunk */}
      <rect x={55} y={68} width={10} height={24} rx={5} fill="#8B6914" />
      {/* canopy layers */}
      <ellipse cx={60} cy={65} rx={32} ry={20} fill="#1E8A68" />
      <ellipse cx={60} cy={57} rx={26} ry={17} fill="#27AE92" />
      <ellipse cx={60} cy={49} rx={19} ry={13} fill="#2ECC71" />
      <ellipse cx={60} cy={43} rx={12} ry={9} fill="#4ED371" />
    </svg>
  );
}

/** Stage 3 — young tree with layered canopy and visible roots.
 *  Exported so other screens (e.g. the data dashboard) can reuse the
 *  illustration as an icon. */
export function YoungTree() {
  return (
    <svg viewBox="15 5 90 95" width="100%" height="100%" aria-hidden>
      <ellipse cx={60} cy={92} rx={32} ry={7} fill="#3D6B4F" opacity={0.45} />
      {/* trunk */}
      <rect x={53} y={60} width={14} height={33} rx={6} fill="#7C5B2A" />
      {/* roots */}
      <line x1={53} y1={89} x2={40} y2={94} stroke="#7C5B2A" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={67} y1={89} x2={80} y2={94} stroke="#7C5B2A" strokeWidth={2.5} strokeLinecap="round" />
      {/* canopy */}
      <ellipse cx={60} cy={59} rx={37} ry={24} fill="#166B50" />
      <ellipse cx={60} cy={51} rx={30} ry={20} fill="#218E6A" />
      <ellipse cx={60} cy={43} rx={23} ry={16} fill="#27AE92" />
      <ellipse cx={60} cy={36} rx={17} ry={12} fill="#2ECC71" />
      <ellipse cx={60} cy={29} rx={11} ry={8} fill="#4ED371" />
    </svg>
  );
}

/** Stage 4 — full mature tree with glow and sparkle details.
 *  Exported so other screens (e.g. the data dashboard) can reuse the
 *  illustration as an icon. */
export function MatureTree() {
  return (
    <svg viewBox="10 5 100 95" width="100%" height="100%" aria-hidden>
      {/* ambient glow */}
      <ellipse cx={60} cy={52} rx={52} ry={48} fill="#4ED371" opacity={0.07} />
      <ellipse cx={60} cy={93} rx={36} ry={7} fill="#3D6B4F" opacity={0.45} />
      {/* trunk */}
      <rect x={51} y={55} width={18} height={39} rx={8} fill="#7C5B2A" />
      {/* roots */}
      <line x1={51} y1={88} x2={35} y2={95} stroke="#7C5B2A" strokeWidth={3} strokeLinecap="round" />
      <line x1={69} y1={88} x2={85} y2={95} stroke="#7C5B2A" strokeWidth={3} strokeLinecap="round" />
      <line x1={51} y1={79} x2={38} y2={86} stroke="#7C5B2A" strokeWidth={2} strokeLinecap="round" />
      <line x1={69} y1={79} x2={82} y2={86} stroke="#7C5B2A" strokeWidth={2} strokeLinecap="round" />
      {/* canopy — 6 layers for richness */}
      <ellipse cx={60} cy={62} rx={43} ry={28} fill="#124F3C" />
      <ellipse cx={60} cy={54} rx={37} ry={24} fill="#186B50" />
      <ellipse cx={60} cy={46} rx={31} ry={20} fill="#218E6A" />
      <ellipse cx={60} cy={38} rx={25} ry={17} fill="#27AE92" />
      <ellipse cx={60} cy={30} rx={19} ry={13} fill="#2ECC71" />
      <ellipse cx={60} cy={22} rx={13} ry={10} fill="#3DD68C" />
      <ellipse cx={60} cy={15} rx={8} ry={6} fill="#4ED371" />
      {/* sparkle dots */}
      <circle cx={29} cy={50} r={2.5} fill="#4ED371" opacity={0.7} />
      <circle cx={91} cy={46} r={2.5} fill="#27AE92" opacity={0.7} />
      <circle cx={25} cy={64} r={1.8} fill="#2ECC71" opacity={0.6} />
      <circle cx={95} cy={60} r={1.8} fill="#4ED371" opacity={0.6} />
      <circle cx={37} cy={30} r={1.5} fill="#3DD68C" opacity={0.8} />
      <circle cx={83} cy={28} r={1.5} fill="#4ED371" opacity={0.8} />
    </svg>
  );
}

const TREE_BY_STAGE: Record<Stage, () => React.ReactElement> = {
  0: Sprout,
  1: Seedling,
  2: Sapling,
  3: YoungTree,
  4: MatureTree,
};

// ── Component ────────────────────────────────────────────────────────────────

type ScoreAnim = { key: number; delta: number } | null;

type Props = {
  totalScore: number;
  userId: string;
  /** Forwarded from the parent's score-change detector. */
  scoreAnim: ScoreAnim;
};

export function TreeCard({ totalScore, userId, scoreAnim }: Props) {
  // ── Persistence ──────────────────────────────────────────────────────────
  // trees_planted now lives on the profile row in Supabase so admin can edit
  // it (and so it survives across devices). We mirror it into local state for
  // snappy UI; writes go through the profile, then refresh().
  const { profile, refresh } = useCurrentProfile();
  const treesPlanted = profile?.trees_planted ?? 0;

  // ── First-time tooltip ───────────────────────────────────────────────────
  const [showTooltip, setShowTooltip] = useState<boolean>(
    () => !localStorage.getItem('tree-tooltip-seen'),
  );
  useEffect(() => {
    if (!showTooltip) return;
    localStorage.setItem('tree-tooltip-seen', '1');
    const t = setTimeout(() => setShowTooltip(false), 6000);
    return () => clearTimeout(t);
  }, [showTooltip]);

  // ── Watering animation ───────────────────────────────────────────────────
  const [waterDrops, setWaterDrops] = useState<Array<{ id: number; x: number }>>([]);
  const lastAnimKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!scoreAnim || scoreAnim.delta <= 0) return;
    if (scoreAnim.key === lastAnimKeyRef.current) return;
    lastAnimKeyRef.current = scoreAnim.key;

    // Spawn 3 drops at random horizontal positions within the tree area
    const drops = [0, 1, 2].map((i) => ({
      id: scoreAnim.key * 10 + i,
      x: 18 + i * 22 + Math.random() * 8,
    }));
    setWaterDrops((prev) => [...prev, ...drops]);
    const t = setTimeout(
      () => setWaterDrops((prev) => prev.filter((d) => !drops.find((nd) => nd.id === d.id))),
      1000,
    );
    return () => clearTimeout(t);
  }, [scoreAnim]);

  // ── Bar pulse on watering ────────────────────────────────────────────────
  const [barPulse, setBarPulse] = useState(false);
  const lastBarKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!scoreAnim || scoreAnim.delta <= 0) return;
    if (scoreAnim.key === lastBarKeyRef.current) return;
    lastBarKeyRef.current = scoreAnim.key;
    setBarPulse(true);
    const t = setTimeout(() => setBarPulse(false), 650);
    return () => clearTimeout(t);
  }, [scoreAnim]);

  // ── Tree state ───────────────────────────────────────────────────────────
  /**
   * Points already "spent" on prior trees. Each prior tree consumed its own
   * (possibly discounted) cycle target, so we sum those up rather than
   * multiplying by a single constant.
   */
  const pointsConsumedByPriorTrees = Array.from({ length: treesPlanted }, (_, i) =>
    cycleTargetFor(i),
  ).reduce((a, b) => a + b, 0);

  const cycleTarget = cycleTargetFor(treesPlanted);
  const stageThresholds = stageThresholdsFor(cycleTarget);

  /** Points accumulated in this planting cycle. */
  const cycleScore = Math.max(0, totalScore - pointsConsumedByPriorTrees);
  const isMature = cycleScore >= cycleTarget;
  const stage = stageFor(cycleScore, stageThresholds);
  const progressPct = isMature ? 100 : Math.round((cycleScore / cycleTarget) * 100);

  // Next stage threshold / pts remaining — reserved for future "X more pts" label
  // const nextThreshold = !isMature ? (stageThresholds.find((t) => t > cycleScore) ?? cycleTarget) : cycleTarget;
  // const ptsToNext = isMature ? 0 : nextThreshold - cycleScore;

  // ── Plant action ─────────────────────────────────────────────────────────
  const handlePlant = async () => {
    const next = treesPlanted + 1;
    if (userId) {
      const { error } = await supabase
        .from('profiles')
        .update({ trees_planted: next })
        .eq('id', userId);
      if (error) {
        console.error('[TreeCard] failed to bump trees_planted:', error);
        return;
      }
      await refresh();
    }
    window.open('https://onetreeplanted.org/products/plant-trees', '_blank');
  };

  // Small random jitter so the floating delta badge doesn't always land in
  // the exact same spot — keeps it feeling alive.
  const animOffset = useMemo(
    () => Math.round((Math.random() - 0.5) * 18), // ±9px horizontal
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreAnim?.key],
  );

  const TreeSVGComponent = TREE_BY_STAGE[stage];

  // ── Field popup state ────────────────────────────────────────────────────
  const [fieldOpen, setFieldOpen] = useState(false);

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      aria-label="פתח את החלקה שלי"
      onClick={() => setFieldOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFieldOpen(true);
        }
      }}
      className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3 relative overflow-hidden cursor-pointer hover:border-forest-600/50 hover:bg-surface-card/80 transition-colors text-right"
    >

      {/* ── First-time tooltip ─────────────────────────────────────────── */}
      {showTooltip && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowTooltip(false);
          }}
          className="absolute inset-x-3 top-2 z-10 rounded-xl bg-forest-200/95 backdrop-blur-sm px-3 py-2.5 text-right shadow-lg w-[calc(100%-1.5rem)] text-start"
          aria-label="סגור הסבר"
        >
          <p className="text-sm font-semibold text-ink-100 leading-snug inline-flex items-center gap-1.5">
            <Emoji emoji="🌱" size={16} /> הניקוד שלך משקה עץ דיגיטלי
          </p>
          <p className="text-[11px] text-ink-300 mt-0.5 leading-relaxed inline-flex items-center gap-1">
            כשהעץ יבשיל — תוכל לשתול עץ אמיתי באפריקה <Emoji emoji="🌍" size={13} />
          </p>
        </button>
      )}

      <div className="flex items-center gap-3">

        {/* ── Tree illustration (right in RTL — first in DOM) ─────────── */}
        <div className="relative shrink-0 w-20 h-16">
          <TreeSVGComponent />
          {/* Water drops fall from above the tree canopy */}
          {waterDrops.map((drop, i) => (
            <span
              key={drop.id}
              className="water-drop"
              style={{
                top: '-2px',
                left: `${drop.x}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
          {/* Trees-planted badge — small circle pinned to the bottom-right
              of the tree illustration (visually right in both LTR and RTL). */}
          <span
            className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-forest-600 text-cream-50 text-[11px] font-bold tabular-nums flex items-center justify-center shadow-md ring-2 ring-surface-card"
            aria-label={`${treesPlanted} עצים נשתלו`}
          >
            {treesPlanted}
          </span>
        </div>

        {/* ── Info column ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Stage label + "X pts to next" */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-ink-100 tracking-wide">
              {STAGE_LABELS[stage]}
            </span>
            <span className="text-[10px] tabular-nums">
              {isMature ? (
                <span className="text-forest-400 font-bold inline-flex items-center gap-1">מוכן לשתילה! <Emoji emoji="🎉" size={13} /></span>
              ) : (
                <span className="text-ink-300 font-semibold">{progressPct}%</span>
              )}
            </span>
          </div>

          {/* Progress bar — 0 → CYCLE_TARGET */}
          <div className="relative h-2 rounded-full bg-surface-raised overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isMature ? 'bg-forest-400' : 'bg-forest-600'
              } ${barPulse ? 'animate-bar-pulse' : ''}`}
              style={{ width: `${progressPct}%` }}
            />
            {/* Stage tick marks */}
            {stageThresholds.slice(1).map((threshold) => {
              const pct = (threshold / cycleTarget) * 100;
              return (
                <span
                  key={threshold}
                  className="absolute top-0 bottom-0 w-px bg-surface-card/60"
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>

          {/* Total score — trees-planted count now lives in the badge above. */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-300">ניקוד:</span>
            {/* relative wrapper so the floating delta badge anchors to the score number */}
            <span className="relative text-base text-ink-100 font-bold tabular-nums">
              {totalScore}
              {scoreAnim && (
                <span
                  key={`delta-${scoreAnim.key}`}
                  aria-hidden="true"
                  className={`pointer-events-none absolute font-bold text-sm tabular-nums whitespace-nowrap ${
                    scoreAnim.delta > 0
                      ? 'text-forest-500 animate-score-float'
                      : 'text-red-400 animate-score-flash-down'
                  }`}
                  style={{ left: `calc(50% + ${animOffset}px)`, top: 0 }}
                >
                  {scoreAnim.delta > 0 ? `+${scoreAnim.delta}` : scoreAnim.delta}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ── Plant button — appears only when mature ─────────────────── */}
      {isMature && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePlant();
          }}
          className="mt-3 w-full rounded-xl bg-forest-600 hover:bg-forest-500 active:scale-95 transition-all py-2.5 text-cream-50 text-sm font-bold flex items-center justify-center gap-2 shadow-md"
        >
          <span>🌍</span>
          <span>שתול עץ אמיתי באפריקה — $1</span>
        </button>
      )}
    </div>

    {/* ── Field popup — full isometric plot of all the user's trees ── */}
    <TreeFieldModal
      open={fieldOpen}
      onClose={() => setFieldOpen(false)}
      totalScore={totalScore}
      treesPlanted={treesPlanted}
      stage={stage}
      stageLabel={STAGE_LABELS[stage]}
      cycleScore={cycleScore}
      cycleTarget={cycleTarget}
      progressPct={progressPct}
      isMature={isMature}
    />
    </>
  );
}

// ── Isometric Field ──────────────────────────────────────────────────────────
//
// A diamond-shaped grass plot in light isometric projection. The user's
// current growing tree sits at the center; mature trees fan out from the
// center based on how many they have already planted; every other slot
// shows a small sprout to suggest "future plantings."
//
// Slot ordering is deterministic so trees stay put across re-renders.
// Cells are sorted by distance-from-center first (so mature trees grow
// outward as the count increases), then by angle within the same ring
// for visual variety.

const FIELD_GRID = 5;
const FIELD_CENTER = 2;

const FIELD_CELLS: ReadonlyArray<[number, number]> = (() => {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < FIELD_GRID; i++) {
    for (let j = 0; j < FIELD_GRID; j++) {
      if (i === FIELD_CENTER && j === FIELD_CENTER) continue;
      cells.push([i, j]);
    }
  }
  cells.sort((a, b) => {
    const da = Math.hypot(a[0] - FIELD_CENTER, a[1] - FIELD_CENTER);
    const db = Math.hypot(b[0] - FIELD_CENTER, b[1] - FIELD_CENTER);
    if (Math.abs(da - db) < 0.05) {
      // Same ring — sort by angle so positions don't look perfectly symmetric.
      return (
        Math.atan2(a[0] - FIELD_CENTER, a[1] - FIELD_CENTER) -
        Math.atan2(b[0] - FIELD_CENTER, b[1] - FIELD_CENTER)
      );
    }
    return da - db;
  });
  return cells;
})();

function IsometricField({
  treesPlanted,
  currentStage,
}: {
  treesPlanted: number;
  currentStage: Stage;
}) {
  // Geometry — kept in arbitrary SVG units; CSS scales the whole thing.
  const CELL_W = 30;
  const CELL_H = 15;
  const PLATE_W = FIELD_GRID * CELL_W * 2; // 300
  const PLATE_H = FIELD_GRID * CELL_H * 2; // 150
  const WALL_H = 20;
  const PAD_TOP = 56; // headroom so the center tree doesn't clip
  const TOTAL_H = PLATE_H + WALL_H + PAD_TOP;
  const ORIGIN_X = PLATE_W / 2;

  // Convert (i, j) grid coords to screen (x, y), with the diamond's top
  // anchored at (ORIGIN_X, PAD_TOP).
  function toScreen(i: number, j: number): [number, number] {
    const x = ORIGIN_X + (j - i) * CELL_W;
    const y = PAD_TOP + (i + j + 1) * CELL_H;
    return [x, y];
  }

  // Diamond corners.
  const topPt: [number, number] = [ORIGIN_X, PAD_TOP];
  const rightPt: [number, number] = [PLATE_W, PAD_TOP + FIELD_GRID * CELL_H];
  const botPt: [number, number] = [ORIGIN_X, PAD_TOP + PLATE_H];
  const leftPt: [number, number] = [0, PAD_TOP + FIELD_GRID * CELL_H];

  // Build the list of things to render.
  type Item = { kind: 'current' | 'mature' | 'sprout'; i: number; j: number };
  const items: Item[] = [
    { kind: 'current', i: FIELD_CENTER, j: FIELD_CENTER },
  ];
  for (let k = 0; k < FIELD_CELLS.length; k++) {
    const [i, j] = FIELD_CELLS[k];
    items.push({ kind: k < treesPlanted ? 'mature' : 'sprout', i, j });
  }
  // Render back-to-front so closer trees overlap farther ones correctly.
  items.sort((a, b) => a.i + a.j - (b.i + b.j));

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${PLATE_W} / ${TOTAL_H}` }}
    >
      {/* Plate (background SVG) */}
      <svg
        viewBox={`0 0 ${PLATE_W} ${TOTAL_H}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="iso-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4DA76A" />
            <stop offset="100%" stopColor="#236B40" />
          </linearGradient>
          <linearGradient id="iso-wall-left" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B6332" />
            <stop offset="100%" stopColor="#4A341A" />
          </linearGradient>
          <linearGradient id="iso-wall-right" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6E4E26" />
            <stop offset="100%" stopColor="#352511" />
          </linearGradient>
        </defs>

        {/* Left wall */}
        <polygon
          points={`${leftPt[0]},${leftPt[1]} ${botPt[0]},${botPt[1]} ${botPt[0]},${botPt[1] + WALL_H} ${leftPt[0]},${leftPt[1] + WALL_H}`}
          fill="url(#iso-wall-left)"
        />
        {/* Right wall */}
        <polygon
          points={`${botPt[0]},${botPt[1]} ${rightPt[0]},${rightPt[1]} ${rightPt[0]},${rightPt[1] + WALL_H} ${botPt[0]},${botPt[1] + WALL_H}`}
          fill="url(#iso-wall-right)"
        />
        {/* Top grass diamond */}
        <polygon
          points={`${topPt[0]},${topPt[1]} ${rightPt[0]},${rightPt[1]} ${botPt[0]},${botPt[1]} ${leftPt[0]},${leftPt[1]}`}
          fill="url(#iso-grass)"
          stroke="#1d5934"
          strokeWidth={1}
        />

        {/* Subtle grid lines on the grass — gives the iso-cube feel. */}
        {Array.from({ length: FIELD_GRID - 1 }).map((_, k) => {
          const t = k + 1;
          // Lines from top-left edge to bottom-right edge
          const a1 = toScreen(t, 0);
          const a2 = toScreen(t, FIELD_GRID - 1);
          // Lines from top-right edge to bottom-left edge
          const b1 = toScreen(0, t);
          const b2 = toScreen(FIELD_GRID - 1, t);
          return (
            <g key={k} stroke="#1d5934" strokeWidth={0.5} opacity={0.35}>
              <line
                x1={a1[0]}
                y1={a1[1] - CELL_H}
                x2={a2[0]}
                y2={a2[1] - CELL_H}
              />
              <line
                x1={b1[0]}
                y1={b1[1] - CELL_H}
                x2={b2[0]}
                y2={b2[1] - CELL_H}
              />
            </g>
          );
        })}

        {/* Soft pedestal under the centre tree to make it pop. */}
        {(() => {
          const [x, y] = toScreen(FIELD_CENTER, FIELD_CENTER);
          return (
            <ellipse
              cx={x}
              cy={y - 2}
              rx={CELL_W * 1.05}
              ry={CELL_H * 1.05}
              fill="#1d5934"
              opacity={0.4}
            />
          );
        })()}
      </svg>

      {/* Trees as positioned divs on top of the SVG. Sized in % of the
          plate width so they scale with the container. */}
      {items.map((t) => {
        const [x, y] = toScreen(t.i, t.j);
        // Bigger for the centre tree (the one currently growing), medium for
        // mature trees scattered around, tiny for "potential" sprouts.
        const sizePx =
          t.kind === 'current' ? 68 : t.kind === 'mature' ? 42 : 18;
        return (
          <div
            key={`${t.kind}-${t.i}-${t.j}`}
            className="absolute pointer-events-none"
            style={{
              left: `${(x / PLATE_W) * 100}%`,
              top: `${(y / TOTAL_H) * 100}%`,
              width: `${(sizePx / PLATE_W) * 100}%`,
              aspectRatio: '1 / 1',
              // Anchor the BOTTOM-CENTER of the tree at (x, y), since trees
              // grow upward from the soil.
              transform: 'translate(-50%, -88%)',
              zIndex: t.kind === 'current' ? 5 : t.i + t.j,
            }}
          >
            <FieldTreeArt kind={t.kind} currentStage={currentStage} />
          </div>
        );
      })}
    </div>
  );
}

function FieldTreeArt({
  kind,
  currentStage,
}: {
  kind: 'current' | 'mature' | 'sprout';
  currentStage: Stage;
}) {
  if (kind === 'current') {
    const CurrentTree = TREE_BY_STAGE[currentStage];
    return <CurrentTree />;
  }
  if (kind === 'mature') return <MatureTree />;
  return <Sprout />;
}

// ── Field Modal ──────────────────────────────────────────────────────────────

function TreeFieldModal({
  open,
  onClose,
  totalScore,
  treesPlanted,
  stage,
  stageLabel,
  cycleScore,
  cycleTarget,
  progressPct,
  isMature,
}: {
  open: boolean;
  onClose: () => void;
  totalScore: number;
  treesPlanted: number;
  stage: Stage;
  stageLabel: string;
  cycleScore: number;
  cycleTarget: number;
  progressPct: number;
  isMature: boolean;
}) {
  // Lock body scroll while the modal is open so the page underneath can't
  // bounce around (especially on mobile).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Enter / exit animation lifecycle.
  // We keep the modal mounted for ~200ms after `open` flips to false so the
  // exit animation has time to play before the DOM is removed.
  //   'closed'  — fully unmounted (nothing rendered)
  //   'open'    — rendered + running the enter animation / steady state
  //   'exiting' — rendered + running the exit animation
  const EXIT_MS = 200;
  const [phase, setPhase] = useState<'closed' | 'open' | 'exiting'>(
    open ? 'open' : 'closed',
  );
  useEffect(() => {
    if (open) {
      setPhase('open');
      return;
    }
    // open flipped to false — kick off the exit animation if we were visible.
    setPhase((p) => (p === 'closed' ? 'closed' : 'exiting'));
    const t = setTimeout(() => setPhase('closed'), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (phase === 'closed') return null;

  const isExiting = phase === 'exiting';

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 ${
        isExiting ? 'animate-modal-fade-out' : 'animate-modal-fade-in'
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-md bg-surface-card rounded-3xl border border-surface-border shadow-2xl max-h-[92vh] overflow-y-auto ${
          isExiting ? 'animate-modal-fall-out' : 'animate-modal-rise-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
          <h2 className="text-base font-bold text-ink-100">החלקה שלי</h2>
        </header>

        {/* Isometric plot */}
        <div className="px-3 pb-1">
          <IsometricField
            treesPlanted={treesPlanted}
            currentStage={stage}
          />
        </div>

        {/* Stats */}
        <div className="px-5 pb-5 pt-1 space-y-3">
          {/* Trees planted + stage label */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5 text-ink-100">
              <span className="text-xs text-ink-300">עצים שתולים:</span>
              <span className="text-base font-bold tabular-nums">
                {treesPlanted}
              </span>
            </div>
            <span className="text-xs font-semibold text-ink-100 tracking-wide">
              {stageLabel}
            </span>
          </div>

          {/* Progress bar for the current tree */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] tabular-nums text-ink-300">
              <span>
                {cycleScore} / {cycleTarget}
              </span>
              <span>
                {isMature ? (
                  <span className="text-forest-400 font-bold inline-flex items-center gap-1">
                    מוכן לשתילה! <Emoji emoji="🎉" size={13} />
                  </span>
                ) : (
                  `${progressPct}%`
                )}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-surface-raised overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isMature ? 'bg-forest-400' : 'bg-forest-600'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Total score */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-sm text-ink-300">ניקוד כולל:</span>
            <span className="text-2xl font-bold text-ink-100 tabular-nums leading-none">
              {totalScore}
            </span>
          </div>

          {/* Continue — closes the modal and returns to the habits view. */}
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-xl bg-forest-600 hover:bg-forest-500 active:scale-[0.98] transition-all py-3 text-cream-50 text-sm font-bold shadow-md"
          >
            המשך
          </button>
        </div>
      </div>
    </div>
  );
}
