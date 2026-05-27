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
  // The card-level button is now a "go to your plot" CTA. The actual
  // confirmation + animation happens inside TreeFieldModal, where the user
  // sees their plot first and then chooses to plant.
  const handlePlant = () => {
    setFieldOpen(true);
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
          <span>🎉</span>
          <span>העץ שלך מוכן לשתילה!</span>
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
      userId={userId}
      onPlanted={refresh}
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

// ── Field geometry — shared across IsometricField + planting overlay ────────
// All in arbitrary SVG units; CSS scales the whole thing to container width.
const FIELD_CELL_W = 30;
const FIELD_CELL_H = 15;
const FIELD_PLATE_W = FIELD_GRID * FIELD_CELL_W * 2; // 300
const FIELD_PLATE_H = FIELD_GRID * FIELD_CELL_H * 2; // 150
const FIELD_WALL_H = 20;
const FIELD_PAD_TOP = 56; // headroom so the centre tree doesn't clip
const FIELD_TOTAL_H = FIELD_PLATE_H + FIELD_WALL_H + FIELD_PAD_TOP;
const FIELD_ORIGIN_X = FIELD_PLATE_W / 2;

/** Convert (i, j) grid coords to SVG-space (x, y). */
function cellToScreen(i: number, j: number): [number, number] {
  const x = FIELD_ORIGIN_X + (j - i) * FIELD_CELL_W;
  const y = FIELD_PAD_TOP + (i + j + 1) * FIELD_CELL_H;
  return [x, y];
}

/**
 * Convert (i, j) grid coords to CSS percentages of the field container.
 * Used by both the inside-SVG positioning and the overlay layer (fly-over,
 * confetti) so they line up exactly.
 */
function cellToPct(i: number, j: number): { leftPct: number; topPct: number } {
  const [x, y] = cellToScreen(i, j);
  return {
    leftPct: (x / FIELD_PLATE_W) * 100,
    topPct: (y / FIELD_TOTAL_H) * 100,
  };
}

function IsometricField({
  treesPlanted,
  currentStage,
  forcedCenterStage,
  hideCenter = false,
  hideMatureIndex,
  children,
}: {
  treesPlanted: number;
  currentStage: Stage;
  /** When set, the centre cell ignores `currentStage` and displays this
   *  stage instead. Used to drive the planting replay 0→1→2→3→4. */
  forcedCenterStage?: Stage;
  /** When true the centre tree is not rendered at all. Used during the
   *  "fly to target cell" phase, where the centre tree visually lifts off. */
  hideCenter?: boolean;
  /** When set, suppress the mature tree at FIELD_CELLS[hideMatureIndex].
   *  Used briefly during planting so the fly-over overlay isn't shadowed by
   *  an already-rendered mature tree (after the trees_planted commit lands). */
  hideMatureIndex?: number;
  /** Slot for overlays positioned in the same coordinate space — fly-over,
   *  confetti, etc. */
  children?: React.ReactNode;
}) {
  // Diamond corners.
  const topPt: [number, number] = [FIELD_ORIGIN_X, FIELD_PAD_TOP];
  const rightPt: [number, number] = [
    FIELD_PLATE_W,
    FIELD_PAD_TOP + FIELD_GRID * FIELD_CELL_H,
  ];
  const botPt: [number, number] = [FIELD_ORIGIN_X, FIELD_PAD_TOP + FIELD_PLATE_H];
  const leftPt: [number, number] = [0, FIELD_PAD_TOP + FIELD_GRID * FIELD_CELL_H];

  // Build the list of things to render.
  type Item = {
    kind: 'current' | 'mature' | 'sprout';
    i: number;
    j: number;
    /** index into FIELD_CELLS (only set for non-current cells) */
    cellIndex?: number;
  };
  const items: Item[] = [];
  if (!hideCenter) {
    items.push({ kind: 'current', i: FIELD_CENTER, j: FIELD_CENTER });
  }
  for (let k = 0; k < FIELD_CELLS.length; k++) {
    const [i, j] = FIELD_CELLS[k];
    const isMatureCell = k < treesPlanted;
    if (isMatureCell && k === hideMatureIndex) continue; // suppress during fly-over
    items.push({
      kind: isMatureCell ? 'mature' : 'sprout',
      i,
      j,
      cellIndex: k,
    });
  }
  // Render back-to-front so closer trees overlap farther ones correctly.
  items.sort((a, b) => a.i + a.j - (b.i + b.j));

  // Which stage the centre tree should show.
  const centreStage: Stage = forcedCenterStage ?? currentStage;

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${FIELD_PLATE_W} / ${FIELD_TOTAL_H}` }}
    >
      {/* Plate (background SVG) */}
      <svg
        viewBox={`0 0 ${FIELD_PLATE_W} ${FIELD_TOTAL_H}`}
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
          points={`${leftPt[0]},${leftPt[1]} ${botPt[0]},${botPt[1]} ${botPt[0]},${botPt[1] + FIELD_WALL_H} ${leftPt[0]},${leftPt[1] + FIELD_WALL_H}`}
          fill="url(#iso-wall-left)"
        />
        {/* Right wall */}
        <polygon
          points={`${botPt[0]},${botPt[1]} ${rightPt[0]},${rightPt[1]} ${rightPt[0]},${rightPt[1] + FIELD_WALL_H} ${botPt[0]},${botPt[1] + FIELD_WALL_H}`}
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
          const a1 = cellToScreen(t, 0);
          const a2 = cellToScreen(t, FIELD_GRID - 1);
          // Lines from top-right edge to bottom-left edge
          const b1 = cellToScreen(0, t);
          const b2 = cellToScreen(FIELD_GRID - 1, t);
          return (
            <g key={k} stroke="#1d5934" strokeWidth={0.5} opacity={0.35}>
              <line
                x1={a1[0]}
                y1={a1[1] - FIELD_CELL_H}
                x2={a2[0]}
                y2={a2[1] - FIELD_CELL_H}
              />
              <line
                x1={b1[0]}
                y1={b1[1] - FIELD_CELL_H}
                x2={b2[0]}
                y2={b2[1] - FIELD_CELL_H}
              />
            </g>
          );
        })}

        {/* Soft pedestal under the centre tree to make it pop. */}
        {!hideCenter && (() => {
          const [x, y] = cellToScreen(FIELD_CENTER, FIELD_CENTER);
          return (
            <ellipse
              cx={x}
              cy={y - 2}
              rx={FIELD_CELL_W * 1.05}
              ry={FIELD_CELL_H * 1.05}
              fill="#1d5934"
              opacity={0.4}
            />
          );
        })()}
      </svg>

      {/* Trees as positioned divs on top of the SVG. Sized in % of the
          plate width so they scale with the container. */}
      {items.map((t) => {
        const { leftPct, topPct } = cellToPct(t.i, t.j);
        // Bigger for the centre tree (the one currently growing), medium for
        // mature trees scattered around, tiny for "potential" sprouts.
        const sizePx =
          t.kind === 'current' ? 68 : t.kind === 'mature' ? 42 : 18;
        return (
          <div
            key={`${t.kind}-${t.i}-${t.j}`}
            className="absolute pointer-events-none"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${(sizePx / FIELD_PLATE_W) * 100}%`,
              aspectRatio: '1 / 1',
              // Anchor the BOTTOM-CENTER of the tree at (x, y), since trees
              // grow upward from the soil.
              transform: 'translate(-50%, -88%)',
              zIndex: t.kind === 'current' ? 5 : t.i + t.j,
            }}
          >
            <FieldTreeArt kind={t.kind} currentStage={centreStage} />
          </div>
        );
      })}

      {/* Overlay layer (fly-over tree, confetti) — same coordinate space. */}
      {children}
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

// ── Planting fly-over ───────────────────────────────────────────────────────
//
// A single mature-tree element that starts at the centre-cell position and
// transitions to the target-cell position. We render the same `<MatureTree>`
// art used elsewhere so the landed tree looks identical to its neighbours.
//
// CSS transitions handle the motion: we render at `from` first, then on the
// next frame swap to `to`. React batches state changes, so we use a
// requestAnimationFrame guard to ensure the browser sees the "from" position
// before the "to" position is applied.

function PlantingFlyOver({
  from,
  to,
  phase,
}: {
  from: { leftPct: number; topPct: number };
  to: { leftPct: number; topPct: number };
  phase: 'flying' | 'confetti';
}) {
  // Once we enter 'flying', schedule the position swap on the next frame.
  const [atTarget, setAtTarget] = useState(false);
  useEffect(() => {
    if (phase !== 'flying') {
      setAtTarget(true); // already landed by the time confetti starts
      return;
    }
    setAtTarget(false);
    const id = requestAnimationFrame(() => setAtTarget(true));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const pos = atTarget ? to : from;
  // Centre tree displays at ~68px on a 300-unit plate (~22.7% width); mature
  // peripheral trees at ~42px (~14%). We animate the size down to match the
  // landed-tree size.
  const sizeStartPct = (68 / FIELD_PLATE_W) * 100;
  const sizeEndPct = (42 / FIELD_PLATE_W) * 100;
  const sizePct = atTarget ? sizeEndPct : sizeStartPct;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${pos.leftPct}%`,
        top: `${pos.topPct}%`,
        width: `${sizePct}%`,
        aspectRatio: '1 / 1',
        transform: 'translate(-50%, -88%)',
        transition: `left ${PLANT_FLY_MS}ms cubic-bezier(0.34, 1.2, 0.64, 1), top ${PLANT_FLY_MS}ms cubic-bezier(0.34, 1.2, 0.64, 1), width ${PLANT_FLY_MS}ms ease-in-out`,
        zIndex: 20,
        filter:
          phase === 'flying'
            ? 'drop-shadow(0 6px 8px rgba(0,0,0,0.35))'
            : 'none',
      }}
    >
      <MatureTree />
    </div>
  );
}

// ── Confetti burst ──────────────────────────────────────────────────────────
//
// Pure-CSS celebration: ~24 absolutely-positioned coloured chips that fly
// outward, rotate, and fade. Stable per mount (random offsets are sampled
// once via useMemo) so React re-renders don't restart the animation.

const CONFETTI_COLORS = [
  '#FFD24C', // warm yellow
  '#4ED371', // forest light
  '#27AE92', // forest mid
  '#FF7A59', // coral
  '#5BB3FF', // sky
  '#F2B5D4', // soft pink
];
const CONFETTI_COUNT = 24;

type ConfettiParticle = {
  id: number;
  /** Final offset in pixels relative to burst origin. */
  dxPx: number;
  dyPx: number;
  color: string;
  rotateDeg: number;
  delayMs: number;
  sizePx: number;
  shape: 'square' | 'circle';
};

function ConfettiBurst({
  at,
  durationMs,
}: {
  at: { leftPct: number; topPct: number };
  durationMs: number;
}) {
  const particles = useMemo<ConfettiParticle[]>(() => {
    const out: ConfettiParticle[] = [];
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      // Even angular distribution with a bit of jitter, biased slightly upward.
      const base = (i / CONFETTI_COUNT) * 360;
      const jitter = (Math.random() - 0.5) * 25;
      const angleRad = ((base + jitter) * Math.PI) / 180;
      const distPx = 60 + Math.random() * 50; // 60–110 px outward
      out.push({
        id: i,
        dxPx: Math.cos(angleRad) * distPx,
        // Bias dy upward so chips arc up first, then gravity-style fall happens
        // via the keyframe (we add +30px in the final frame below).
        dyPx: Math.sin(angleRad) * distPx - 25,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotateDeg: Math.random() * 720 - 360,
        delayMs: Math.random() * 80,
        sizePx: 5 + Math.random() * 5,
        shape: Math.random() < 0.5 ? 'square' : 'circle',
      });
    }
    return out;
  }, []);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${at.leftPct}%`,
        top: `${at.topPct - 4}%`, // burst from just above the tree base
        width: 0,
        height: 0,
        zIndex: 25,
      }}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute"
          style={{
            left: 0,
            top: 0,
            width: `${p.sizePx}px`,
            height: `${p.sizePx}px`,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            // Custom properties consumed by the @keyframes confetti-fly in index.css.
            ['--cf-dx' as string]: `${p.dxPx}px`,
            ['--cf-dy' as string]: `${p.dyPx}px`,
            ['--cf-rot' as string]: `${p.rotateDeg}deg`,
            animation: `confetti-fly ${durationMs}ms cubic-bezier(0.2, 0.7, 0.4, 1) ${p.delayMs}ms forwards`,
            opacity: 0,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}

// ── Field Modal ──────────────────────────────────────────────────────────────

// ── Planting animation timing ──────────────────────────────────────────────
// All durations in ms. Tuned so the whole sequence feels celebratory but not
// tedious — ~3.5s total from button-click to "ready to dismiss".
const PLANT_GROW_PER_STAGE_MS = 320; // 5 stages → ~1.6s
const PLANT_GROW_MS = PLANT_GROW_PER_STAGE_MS * 5;
const PLANT_GROW_PAUSE_MS = 150; // brief hold on mature before take-off
const PLANT_FLY_MS = 750;
const PLANT_CONFETTI_MS = 1200;
/** When during the confetti phase do we commit trees_planted++ to Supabase. */
const PLANT_COMMIT_AT_MS = 500;

type PlantingPhase = 'idle' | 'growing' | 'flying' | 'confetti';

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
  userId,
  onPlanted,
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
  userId: string;
  /** Called after trees_planted has been bumped in Supabase so the parent
   *  can refresh the profile. */
  onPlanted: () => void | Promise<void>;
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

  // ── Planting choreography ────────────────────────────────────────────────
  // `plantingPhase` drives what the IsometricField and overlay layer render
  // during the animation. We snapshot `treesPlanted` at the moment the
  // animation starts so the visible state doesn't jump when the Supabase
  // increment lands mid-animation.
  const [plantingPhase, setPlantingPhase] = useState<PlantingPhase>('idle');
  const [growingStage, setGrowingStage] = useState<Stage>(0);
  const [animTreesPlanted, setAnimTreesPlanted] = useState<number>(treesPlanted);
  /** The FIELD_CELLS index where the newly-grown tree will land. Captured
   *  at animation start so it doesn't move when treesPlanted increments
   *  mid-animation. */
  const [targetCellIndex, setTargetCellIndex] = useState<number>(0);
  const hasCommittedRef = useRef<boolean>(false);
  /** All timers currently scheduled by an in-flight planting animation —
   *  tracked so we can clean them up if the modal closes mid-animation. */
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // While we are NOT animating, mirror the live treesPlanted into the
  // freeze-snapshot so the field reflects reality.
  useEffect(() => {
    if (plantingPhase === 'idle') setAnimTreesPlanted(treesPlanted);
  }, [treesPlanted, plantingPhase]);

  // Clean up any pending timers if the modal closes / unmounts.
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  // Triggered by the in-modal "plant your tree" button.
  const startPlanting = () => {
    if (plantingPhase !== 'idle') return; // already animating
    if (!isMature) return; // shouldn't happen — button is hidden in that case

    // Snapshot the pre-plant tree count for the duration of the animation.
    const targetIndex = treesPlanted; // FIELD_CELLS[targetIndex] is where the new tree lands
    setAnimTreesPlanted(targetIndex);
    setTargetCellIndex(targetIndex);
    hasCommittedRef.current = false;

    // ── Phase 1: growing replay (0 → 4) ──────────────────────────────────
    setPlantingPhase('growing');
    setGrowingStage(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let s = 1; s <= 4; s++) {
      timers.push(
        setTimeout(() => setGrowingStage(s as Stage), s * PLANT_GROW_PER_STAGE_MS),
      );
    }

    // ── Phase 2: fly to target cell ──────────────────────────────────────
    const flyAt = PLANT_GROW_MS + PLANT_GROW_PAUSE_MS;
    timers.push(setTimeout(() => setPlantingPhase('flying'), flyAt));

    // ── Phase 3: confetti burst ──────────────────────────────────────────
    const confettiAt = flyAt + PLANT_FLY_MS;
    timers.push(setTimeout(() => setPlantingPhase('confetti'), confettiAt));

    // ── Commit trees_planted++ to Supabase mid-confetti ──────────────────
    const commitAt = confettiAt + PLANT_COMMIT_AT_MS;
    timers.push(
      setTimeout(async () => {
        if (hasCommittedRef.current) return;
        hasCommittedRef.current = true;
        if (userId) {
          const { error } = await supabase
            .from('profiles')
            .update({ trees_planted: targetIndex + 1 })
            .eq('id', userId);
          if (error) {
            console.error('[TreeFieldModal] failed to bump trees_planted:', error);
          } else {
            await onPlanted();
            // After refresh, reflect the new count in the frozen snapshot too.
            setAnimTreesPlanted(targetIndex + 1);
          }
        }
      }, commitAt),
    );

    // ── Phase 4: back to idle once confetti finishes ─────────────────────
    const idleAt = confettiAt + PLANT_CONFETTI_MS;
    timers.push(setTimeout(() => setPlantingPhase('idle'), idleAt));

    timersRef.current = timers;
  };

  // The new tree's target cell — captured in state at animation start.
  const [targetI, targetJ] =
    targetCellIndex < FIELD_CELLS.length
      ? FIELD_CELLS[targetCellIndex]
      : FIELD_CELLS[FIELD_CELLS.length - 1]; // safety fallback if field is full
  const targetCellPct = cellToPct(targetI, targetJ);
  const centerCellPct = cellToPct(FIELD_CENTER, FIELD_CENTER);

  // What the field should display right now.
  const fieldTreesPlanted =
    plantingPhase === 'idle' ? treesPlanted : animTreesPlanted;
  const forcedCenterStage: Stage | undefined =
    plantingPhase === 'growing' ? growingStage : undefined;
  const hideCenter = plantingPhase === 'flying' || plantingPhase === 'confetti';
  // After the Supabase commit lands the field would naturally render a mature
  // tree at the target cell. During the fly-over we want the overlay to be
  // the only thing visible there.
  const hideMatureIndex =
    plantingPhase === 'flying' || plantingPhase === 'confetti'
      ? targetCellIndex
      : undefined;
  const isAnimating = plantingPhase !== 'idle';

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
      onClick={() => {
        // Don't let the user dismiss the modal mid-planting — they'd miss
        // the moment we just made all that fuss about.
        if (!isAnimating) onClose();
      }}
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
            disabled={isAnimating}
            className="p-1 text-ink-300 hover:text-ink-100 disabled:opacity-30 disabled:hover:text-ink-300"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
          <h2 className="text-base font-bold text-ink-100">החלקה שלי</h2>
        </header>

        {/* Isometric plot */}
        <div className="px-3 pb-1">
          <IsometricField
            treesPlanted={fieldTreesPlanted}
            currentStage={stage}
            forcedCenterStage={forcedCenterStage}
            hideCenter={hideCenter}
            hideMatureIndex={hideMatureIndex}
          >
            {/* ── Planting overlays — same coordinate space as the field ── */}
            {(plantingPhase === 'flying' || plantingPhase === 'confetti') && (
              <PlantingFlyOver
                from={centerCellPct}
                to={targetCellPct}
                phase={plantingPhase}
              />
            )}
            {plantingPhase === 'confetti' && (
              <ConfettiBurst at={targetCellPct} durationMs={PLANT_CONFETTI_MS} />
            )}
          </IsometricField>
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

          {/* Action row — when the tree is mature the user sees TWO buttons:
              the planting CTA on the right (RTL) and the dismiss "המשך" on
              the left. Once planted (or if the tree wasn't ready) only the
              "המשך" button shows, full-width. */}
          {isMature && plantingPhase === 'idle' ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={startPlanting}
                className="flex-1 rounded-xl bg-forest-500 hover:bg-forest-400 active:scale-[0.98] transition-all py-3 text-cream-50 text-sm font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                <Emoji emoji="🌍" size={16} />
                <span>שתול את העץ שלך</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-surface-raised hover:bg-surface-raised/70 active:scale-[0.98] transition-all py-3 text-ink-100 text-sm font-bold shadow-md"
              >
                המשך
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={isAnimating}
              className="mt-3 w-full rounded-xl bg-forest-600 hover:bg-forest-500 active:scale-[0.98] transition-all py-3 text-cream-50 text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-wait disabled:active:scale-100"
            >
              המשך
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
