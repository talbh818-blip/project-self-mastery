import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Emoji } from '../../components/Emoji';
import { useCurrentProfile } from '../admin/ProfileContext';
import { supabase } from '../../lib/supabase';
import type { TreePlacement } from '../admin/types';

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
  /** True once BOTH the habit data and the profile have loaded. Until then
   *  the card renders a skeleton — otherwise the briefly-mismatched
   *  totalScore / cycle_score_floor flashes a wrong (often "ready to plant")
   *  state on every refresh. */
  ready?: boolean;
};

export function TreeCard({ totalScore, userId, scoreAnim, ready = true }: Props) {
  // ── Persistence ──────────────────────────────────────────────────────────
  // trees_planted now lives on the profile row in Supabase so admin can edit
  // it (and so it survives across devices). We mirror it into local state for
  // snappy UI; writes go through the profile, then refresh().
  const { profile, refresh } = useCurrentProfile();
  const treesPlanted = profile?.trees_planted ?? 0;
  const treePlacements: TreePlacement[] = profile?.tree_placements ?? [];

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
   * Score the user has already spent on PLANTED trees (DB-persisted).
   * Only the planting action moves this; admin edits to trees_planted
   * leave it alone, so the progress meter doesn't snap to 0 when an admin
   * gifts a user some trees. See migration 0014.
   */
  const cycleScoreFloor = profile?.cycle_score_floor ?? 0;
  const cycleTarget = cycleTargetFor(treesPlanted);
  const stageThresholds = stageThresholdsFor(cycleTarget);

  // Self-healing floor. The stored floor can become stale after an admin
  // reset / data cleanup (e.g. score set back to 0, trees set to 0): it then
  // sits ABOVE the current total, which would peg the meter at 0% forever.
  // Two invariants restore "just continue from here":
  //   • 0 planted trees ⇒ nothing has been consumed ⇒ floor must be 0.
  //   • the floor can never exceed the current total (can't consume more
  //     score than exists).
  // We use the corrected value for display immediately, and persist it (below)
  // so the meter keeps growing as new points come in.
  const effectiveFloor =
    treesPlanted === 0 ? 0 : Math.min(cycleScoreFloor, totalScore);

  /** Points accumulated in this planting cycle. */
  const cycleScore = Math.max(0, totalScore - effectiveFloor);
  const isMature = cycleScore >= cycleTarget;
  const stage = stageFor(cycleScore, stageThresholds);
  const progressPct = isMature ? 100 : Math.round((cycleScore / cycleTarget) * 100);

  // Persist the corrected floor once (when it's stale) so the meter keeps
  // growing across reloads, not just in this render. Guarded so it fires at
  // most once per stale value and never loops.
  const healingRef = useRef(false);
  useEffect(() => {
    if (!ready || !profile || !userId) return;
    if (effectiveFloor === cycleScoreFloor || healingRef.current) return;
    healingRef.current = true;
    (async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ cycle_score_floor: effectiveFloor })
          .eq('id', userId)
          .select()
          .maybeSingle();
        if (error) {
          console.error('[TreeCard] cycle_score_floor self-heal failed:', error);
        }
        await refresh();
      } finally {
        healingRef.current = false;
      }
    })();
  }, [ready, profile, userId, effectiveFloor, cycleScoreFloor, refresh]);

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

  // While the score + profile are still loading, show a quiet skeleton of the
  // same height instead of computing the tree state from half-loaded data
  // (which flashed a wrong "ready to plant" meter + a bogus "+N" pop).
  if (!ready) {
    return (
      <div className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3 relative overflow-hidden">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="shrink-0 w-20 h-16 rounded-xl bg-surface-raised" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3 w-24 rounded bg-surface-raised" />
            <div className="h-2 w-full rounded-full bg-surface-raised" />
            <div className="h-3 w-16 rounded bg-surface-raised" />
          </div>
        </div>
      </div>
    );
  }

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
            className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-forest-600 text-on-accent text-[11px] font-bold tabular-nums flex items-center justify-center shadow-md ring-2 ring-surface-card"
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
          className="mt-3 w-full rounded-xl bg-forest-600 hover:bg-forest-500 active:scale-95 transition-all py-2.5 text-on-accent text-sm font-bold flex items-center justify-center gap-2 shadow-md btn-shimmer"
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
      treePlacements={treePlacements}
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

// ── Field geometry — shared across IsometricField + planting overlay ────────
// Cell size in arbitrary SVG units stays constant; the PLATE grows as the
// grid expands, and the SVG viewBox scales to fit the container. So as the
// grid gets bigger, each cell visually shrinks → automatic zoom-out.
const FIELD_CELL_W = 30;
const FIELD_CELL_H = 15;
const FIELD_WALL_H = 20;
const FIELD_PAD_TOP = 56; // headroom so the centre tree doesn't clip

function plateW(grid: number) {
  return grid * FIELD_CELL_W * 2;
}
function plateH(grid: number) {
  return grid * FIELD_CELL_H * 2;
}
function totalH(grid: number) {
  return plateH(grid) + FIELD_WALL_H + FIELD_PAD_TOP;
}
function originX(grid: number) {
  return plateW(grid) / 2;
}
function gridCenter(grid: number) {
  return Math.floor(grid / 2);
}

/** Convert (i, j) grid coords to SVG-space (x, y) for a given grid size. */
function cellToScreenFor(grid: number, i: number, j: number): [number, number] {
  const x = originX(grid) + (j - i) * FIELD_CELL_W;
  const y = FIELD_PAD_TOP + (i + j + 1) * FIELD_CELL_H;
  return [x, y];
}

/** Convert (i, j) grid coords to CSS percentages of the field container. */
function cellToPctFor(
  grid: number,
  i: number,
  j: number,
): { leftPct: number; topPct: number } {
  const [x, y] = cellToScreenFor(grid, i, j);
  return {
    leftPct: (x / plateW(grid)) * 100,
    topPct: (y / totalH(grid)) * 100,
  };
}

/**
 * Ordered list of non-centre cells for a given grid size, sorted by distance
 * from the centre (then by angle within the same ring). Memoised per grid.
 * This is what we use as the DEFAULT placement order when the user hasn't
 * dragged trees around yet.
 */
const CELLS_CACHE = new Map<number, ReadonlyArray<[number, number]>>();
function cellsForGrid(grid: number): ReadonlyArray<[number, number]> {
  const cached = CELLS_CACHE.get(grid);
  if (cached) return cached;
  const center = gridCenter(grid);
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      if (i === center && j === center) continue;
      cells.push([i, j]);
    }
  }
  cells.sort((a, b) => {
    const da = Math.hypot(a[0] - center, a[1] - center);
    const db = Math.hypot(b[0] - center, b[1] - center);
    if (Math.abs(da - db) < 0.05) {
      // Same ring — sort by angle so positions don't look perfectly symmetric.
      return (
        Math.atan2(a[0] - center, a[1] - center) -
        Math.atan2(b[0] - center, b[1] - center)
      );
    }
    return da - db;
  });
  CELLS_CACHE.set(grid, cells);
  return cells;
}

// ── Grid expansion tiers ────────────────────────────────────────────────────
// As the user plants more trees the plot expands and cells visually shrink
// (zoom-out). Each tier's `maxTrees` is the LAST tree count that fits in
// that grid; once the user crosses it we step up to the next size.
const GRID_TIERS = [
  { maxTrees: 24, grid: 5 }, // 24 outer cells in a 5×5
  { maxTrees: 48, grid: 7 }, // 48 outer cells in a 7×7
  { maxTrees: Infinity, grid: 9 },
] as const;

function gridSizeFor(treesPlanted: number): number {
  for (const tier of GRID_TIERS) {
    if (treesPlanted <= tier.maxTrees) return tier.grid;
  }
  return GRID_TIERS[GRID_TIERS.length - 1].grid;
}

/**
 * Resolve the actual (i, j) cell for the k-th planted tree. Uses the stored
 * relative-to-centre offset when available; otherwise falls back to the
 * default ordering for the current grid.
 */
function placementToCell(
  grid: number,
  treeIndex: number,
  placements: TreePlacement[],
): [number, number] {
  const stored = placements[treeIndex];
  if (stored) {
    const c = gridCenter(grid);
    return [stored.di + c, stored.dj + c];
  }
  const fallback = cellsForGrid(grid);
  return fallback[treeIndex] ?? [gridCenter(grid), gridCenter(grid)];
}

/** Inverse of placementToCell — used when persisting after a drag. */
function cellToPlacement(grid: number, i: number, j: number): TreePlacement {
  const c = gridCenter(grid);
  return { di: i - c, dj: j - c };
}

/**
 * Find the (i, j) cell whose centre is closest to the given container-%
 * point. Brute-force over all cells — fast enough for grids up to 9×9.
 */
function pctToNearestCell(
  grid: number,
  leftPct: number,
  topPct: number,
): [number, number] {
  let bestI = gridCenter(grid);
  let bestJ = gridCenter(grid);
  let bestDist = Infinity;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const p = cellToPctFor(grid, i, j);
      const dx = p.leftPct - leftPct;
      const dy = p.topPct - topPct;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestI = i;
        bestJ = j;
      }
    }
  }
  return [bestI, bestJ];
}

const MATURE_PERIPHERY_SIZE = 42;
const PLACEHOLDER_SPROUT_SIZE = 18;

// ── Centre-tree size by growth stage (in viewBox px units) ─────────────────
// The centre tree ramps from a small seed up to EXACTLY the size of a planted
// mature tree (MATURE_PERIPHERY_SIZE). A fully-grown centre tree must look the
// same size as the ones already on the plot — the pedestal underneath is what
// distinguishes it, not scale.
const CENTER_SIZE_BY_STAGE: Record<Stage, number> = {
  0: 24, // Sprout
  1: 30, // Seedling
  2: 35, // Sapling
  3: 39, // YoungTree
  4: MATURE_PERIPHERY_SIZE, // MatureTree — identical to the planted trees (42)
};


function IsometricField({
  treesPlanted,
  currentStage,
  placements,
  onPlacementsChange,
  forcedCenterStage,
  hideCenter = false,
  hideMatureIndex,
  children,
}: {
  treesPlanted: number;
  currentStage: Stage;
  /** Stored placements, one per planted tree. May be shorter than
   *  treesPlanted (legacy users) — the renderer falls back to the default
   *  cell order for the surplus. */
  placements: TreePlacement[];
  /** Called when the user successfully drags a tree to a new cell or swaps
   *  two trees. The new full placements array is passed up so the parent
   *  can persist it to Supabase. Returns true if the write succeeded so the
   *  field can keep its optimistic update (or false → revert). */
  onPlacementsChange?: (next: TreePlacement[]) => void | Promise<boolean>;
  /** When set, the centre cell ignores `currentStage` and displays this
   *  stage instead. Used to drive the planting replay 0→1→2→3→4. */
  forcedCenterStage?: Stage;
  /** When true the centre tree is not rendered at all. Used during the
   *  "fly to target cell" phase, where the centre tree visually lifts off. */
  hideCenter?: boolean;
  /** When set, suppress the mature tree at the given placement index.
   *  Reserved for the planting overlay — not currently used. */
  hideMatureIndex?: number;
  /** Slot for overlays positioned in the same coordinate space. */
  children?: React.ReactNode;
}) {
  // Grid size scales with the number of trees planted. Cells get smaller as
  // the grid grows because each cell is a smaller % of the (larger) plate.
  const grid = gridSizeFor(treesPlanted);
  const center = gridCenter(grid);

  // Optimistic placements: applied INSTANTLY on drop so the tree slides to
  // its new cell without waiting for the Supabase round-trip. Cleared once
  // the persisted `placements` prop catches up (or on a failed write).
  const [optimistic, setOptimistic] = useState<TreePlacement[] | null>(null);
  // Whenever the real (persisted) placements arrive, drop the override —
  // the prop is now the source of truth.
  useEffect(() => {
    setOptimistic(null);
  }, [placements]);
  const effectivePlacements = optimistic ?? placements;

  // Resolve each planted tree to its concrete cell. We freeze a snapshot
  // at render time so the drag-overlay calculations stay consistent.
  const resolvedCells = useMemo(() => {
    const out: [number, number][] = [];
    for (let k = 0; k < treesPlanted; k++) {
      out.push(placementToCell(grid, k, effectivePlacements));
    }
    return out;
  }, [treesPlanted, effectivePlacements, grid]);

  // ── Drag interaction (ref-based, direct-DOM positioning) ─────────────────
  //
  // Why refs + direct DOM instead of React state per pointermove: at high
  // event rates the state→render→handler-rebind loop introduced stale
  // closures (a leftover `pressing` handler could cancel a freshly-started
  // drag) and dropped position updates, so the tree "lifted" but never
  // tracked the finger — and the release then snapped back to the source.
  //
  // Here the floating "ghost" tree is positioned by writing to its DOM node
  // directly (`ghostRef.current.style`), so React never re-renders during the
  // drag. Only two pieces of React state flip — `dragIndex` (which tree is
  // lifted, set once at drag-start and cleared at drop) and `snapCell` (the
  // highlighted target, updated only when it actually changes).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [snapCell, setSnapCell] = useState<[number, number] | null>(null);

  // Active drag bookkeeping (non-null ⇒ a tree is lifted). Lives in a ref so
  // the per-pointermove updates don't trigger React renders.
  const pressRef = useRef<{
    treeIndex: number;
    pointerId: number;
  } | null>(null);
  const liveRef = useRef<{ leftPct: number; topPct: number }>({
    leftPct: 50,
    topPct: 50,
  });

  // Mirror render-derived values so the imperative handlers always see fresh
  // data without being re-created.
  const gridRef = useRef(grid);
  const centerRef = useRef(center);
  const treesPlantedRef = useRef(treesPlanted);
  const resolvedCellsRef = useRef(resolvedCells);
  const onPlacementsChangeRef = useRef(onPlacementsChange);
  gridRef.current = grid;
  centerRef.current = center;
  treesPlantedRef.current = treesPlanted;
  resolvedCellsRef.current = resolvedCells;
  onPlacementsChangeRef.current = onPlacementsChange;

  /** Pointer client coords → container-% + nearest grid cell. */
  function pointerToContainerPct(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const g = gridRef.current;
    const c = centerRef.current;
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { leftPct: 50, topPct: 50, i: c, j: c };
    }
    const leftPct = ((clientX - rect.left) / rect.width) * 100;
    const topPct = ((clientY - rect.top) / rect.height) * 100;
    const [i, j] = pctToNearestCell(g, leftPct, topPct);
    return { leftPct, topPct, i, j };
  }

  /** Write the ghost element's position directly to the DOM. */
  function positionGhost(leftPct: number, topPct: number) {
    liveRef.current = { leftPct, topPct };
    const el = ghostRef.current;
    if (el) {
      el.style.left = `${leftPct}%`;
      el.style.top = `${topPct}%`;
    }
  }

  // Document-level listeners, attached once. They read everything from refs.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;
      // A tree is lifted — move the ghost + update the snap ring (only on
      // change). The lift itself happened on pointerdown.
      e.preventDefault();
      const { leftPct, topPct, i, j } = pointerToContainerPct(
        e.clientX,
        e.clientY,
      );
      positionGhost(leftPct, topPct);
      setSnapCell((prev) =>
        prev && prev[0] === i && prev[1] === j ? prev : [i, j],
      );
    };

    const onUp = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;

      // Release → commit. If the tree never moved off its cell this resolves
      // to a no-op (a plain tap that briefly lifted and settled back).
      const g = gridRef.current;
      const c = centerRef.current;
      const tp = treesPlantedRef.current;
      const rc = resolvedCellsRef.current;
      const onChange = onPlacementsChangeRef.current;
      const sourceIndex = press.treeIndex;
      const [targetI, targetJ] = pctToNearestCell(
        g,
        liveRef.current.leftPct,
        liveRef.current.topPct,
      );

      // Reset gesture + UI state first.
      pressRef.current = null;
      setDragIndex(null);
      setSnapCell(null);

      if (targetI === c && targetJ === c) return; // centre is reserved

      const nextArr: TreePlacement[] = [];
      for (let k = 0; k < tp; k++) {
        const [i, j] = rc[k];
        nextArr.push(cellToPlacement(g, i, j));
      }
      const src = nextArr[sourceIndex];
      if (src && src.di + c === targetI && src.dj + c === targetJ) return; // no move

      const occupant = nextArr.findIndex(
        (p, idx) =>
          idx !== sourceIndex && p.di + c === targetI && p.dj + c === targetJ,
      );
      if (occupant >= 0) nextArr[occupant] = nextArr[sourceIndex];
      nextArr[sourceIndex] = cellToPlacement(g, targetI, targetJ);

      // Move the tree NOW (optimistic). The 200ms CSS transition on the tree
      // divs animates the slide. Persist in the background; revert only if
      // the write actually fails.
      setOptimistic(nextArr);
      Promise.resolve(onChange?.(nextArr)).then((ok) => {
        if (ok === false) setOptimistic(null);
      });
    };

    const onCancel = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press || e.pointerId !== press.pointerId) return;
      pressRef.current = null;
      setDragIndex(null);
      setSnapCell(null);
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  // Lift the tree INSTANTLY on press — no delay, no movement required. The
  // ghost appears at the tree's current cell (scaled up) the moment the
  // pointer goes down, so the user immediately sees it's grabbed. Releasing
  // without moving resolves to a no-op in onUp (a tap that briefly lifts).
  function handleTreePointerDown(
    treeIndex: number,
    e: React.PointerEvent<HTMLDivElement>,
  ) {
    if (!onPlacementsChange) return; // drag disabled (e.g. during animations)
    if (pressRef.current) return; // already in a gesture

    pressRef.current = { treeIndex, pointerId: e.pointerId };

    // Seed the ghost at the tree's current cell, then reveal it.
    const sourceCell = resolvedCellsRef.current[treeIndex];
    const seed = sourceCell
      ? cellToPctFor(gridRef.current, sourceCell[0], sourceCell[1])
      : { leftPct: 50, topPct: 50 };
    liveRef.current = { leftPct: seed.leftPct, topPct: seed.topPct };
    setDragIndex(treeIndex);
    setSnapCell(sourceCell ?? null);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(12);
      } catch {
        /* noop */
      }
    }
  }

  // Build the list of things to render.
  type Item = {
    kind: 'current' | 'mature' | 'sprout';
    i: number;
    j: number;
    /** placements index for mature trees; cells index for sprout placeholders */
    keyIndex: number;
    /** Whether this item is the one being dragged (rendered at pointer). */
    isDragging?: boolean;
  };
  const items: Item[] = [];
  if (!hideCenter) {
    items.push({
      kind: 'current',
      i: center,
      j: center,
      keyIndex: -1,
    });
  }
  // Mature trees from placements.
  for (let k = 0; k < treesPlanted; k++) {
    if (k === hideMatureIndex) continue;
    const [i, j] = resolvedCells[k];
    items.push({
      kind: 'mature',
      i,
      j,
      keyIndex: k,
      // The dragged tree is rendered as a separate ghost element (positioned
      // via ref), so we hide its in-grid copy.
      isDragging: dragIndex === k,
    });
  }
  // Placeholder sprouts on cells that are NOT centre and NOT occupied by a
  // mature tree. Use cellsForGrid as the canonical ordering of "all outer
  // cells", filtering out any cell currently held by a mature tree.
  const occupied = new Set(resolvedCells.map(([i, j]) => `${i},${j}`));
  const defaults = cellsForGrid(grid);
  for (let k = 0; k < defaults.length; k++) {
    const [i, j] = defaults[k];
    if (occupied.has(`${i},${j}`)) continue;
    items.push({
      kind: 'sprout',
      i,
      j,
      keyIndex: 1000 + k, // offset to avoid collision with mature keys
    });
  }
  // Render back-to-front so closer trees overlap farther ones correctly.
  items.sort((a, b) => a.i + a.j - (b.i + b.j));

  // Which stage the centre tree should show.
  const centreStage: Stage = forcedCenterStage ?? currentStage;

  // ── SVG geometry for the current grid ────────────────────────────────────
  const PLATE_W = plateW(grid);
  const PLATE_H = plateH(grid);
  const TOTAL_H = totalH(grid);
  const ORIGIN_X = originX(grid);

  // Diamond corners.
  const topPt: [number, number] = [ORIGIN_X, FIELD_PAD_TOP];
  const rightPt: [number, number] = [PLATE_W, FIELD_PAD_TOP + grid * FIELD_CELL_H];
  const botPt: [number, number] = [ORIGIN_X, FIELD_PAD_TOP + PLATE_H];
  const leftPt: [number, number] = [0, FIELD_PAD_TOP + grid * FIELD_CELL_H];

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{
        aspectRatio: `${PLATE_W} / ${TOTAL_H}`,
        // Grid expansion looks like a soft zoom-out because trees keep their
        // viewBox px size while the viewBox itself grows.
        transition: 'aspect-ratio 800ms ease',
        // Disable browser-handled gestures inside the field so a drag is
        // never silently turned into a page scroll. Pointer move/up/cancel
        // are handled by document-level listeners (see the effect above).
        touchAction: 'none',
      }}
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
        {Array.from({ length: grid - 1 }).map((_, k) => {
          const t = k + 1;
          const a1 = cellToScreenFor(grid, t, 0);
          const a2 = cellToScreenFor(grid, t, grid - 1);
          const b1 = cellToScreenFor(grid, 0, t);
          const b2 = cellToScreenFor(grid, grid - 1, t);
          return (
            <g key={k} stroke="#1d5934" strokeWidth={0.5} opacity={0.35}>
              <line x1={a1[0]} y1={a1[1] - FIELD_CELL_H} x2={a2[0]} y2={a2[1] - FIELD_CELL_H} />
              <line x1={b1[0]} y1={b1[1] - FIELD_CELL_H} x2={b2[0]} y2={b2[1] - FIELD_CELL_H} />
            </g>
          );
        })}

        {/* Soft pedestal under the centre tree to make it pop. */}
        {!hideCenter && (() => {
          const [x, y] = cellToScreenFor(grid, center, center);
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

        {/* Highlight ring on the snap target while dragging. Centre cell
            (reserved for the growing tree) lights up red to signal "reject". */}
        {snapCell && (() => {
          const [si, sj] = snapCell;
          const [x, y] = cellToScreenFor(grid, si, sj);
          const isRejected = si === center && sj === center;
          return (
            <ellipse
              cx={x}
              cy={y - 2}
              rx={FIELD_CELL_W * 1.0}
              ry={FIELD_CELL_H * 1.0}
              fill="none"
              stroke={isRejected ? '#FF7A59' : '#FFE99A'}
              strokeWidth={1.5}
              opacity={0.85}
              style={{ transition: 'stroke 120ms ease' }}
            />
          );
        })()}
      </svg>

      {/* Trees as positioned divs on top of the SVG. */}
      {items.map((t) => {
        const { leftPct, topPct } = cellToPctFor(grid, t.i, t.j);
        const sizePx =
          t.kind === 'current'
            ? CENTER_SIZE_BY_STAGE[centreStage]
            : t.kind === 'mature'
              ? MATURE_PERIPHERY_SIZE
              : PLACEHOLDER_SPROUT_SIZE;

        // The dragged tree's in-grid copy is hidden — the floating ghost
        // below represents it during the drag.
        const isDragged = t.isDragging === true;

        return (
          <div
            key={`${t.kind}-${t.keyIndex}`}
            className="absolute"
            onPointerDown={
              t.kind === 'mature'
                ? (e) => handleTreePointerDown(t.keyIndex, e)
                : undefined
            }
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${(sizePx / PLATE_W) * 100}%`,
              aspectRatio: '1 / 1',
              transform: 'translate(-50%, -88%)',
              transition:
                'left 200ms ease, top 200ms ease, width 800ms ease',
              zIndex: t.kind === 'current' ? 5 : t.i + t.j,
              touchAction: t.kind === 'mature' ? 'none' : 'auto',
              cursor:
                t.kind === 'mature' && onPlacementsChange ? 'grab' : 'default',
              pointerEvents: t.kind === 'sprout' ? 'none' : 'auto',
              // Hide (but keep mounted) the tree being dragged.
              visibility: isDragged ? 'hidden' : 'visible',
            }}
          >
            <FieldTreeArt kind={t.kind} currentStage={centreStage} />
          </div>
        );
      })}

      {/* Floating drag ghost — positioned imperatively via ghostRef so the
          drag is smooth and never blocked by React re-renders. Mounted only
          while a tree is being dragged. */}
      {dragIndex !== null && (
        <div
          ref={ghostRef}
          className="absolute pointer-events-none"
          style={{
            left: `${liveRef.current.leftPct}%`,
            top: `${liveRef.current.topPct}%`,
            width: `${(MATURE_PERIPHERY_SIZE / PLATE_W) * 100}%`,
            aspectRatio: '1 / 1',
            transform: 'translate(-50%, -88%) scale(1.12)',
            zIndex: 100,
            filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.45))',
            opacity: 0.95,
          }}
        >
          <MatureTree />
        </div>
      )}

      {/* Overlay layer (planting confetti, etc) — same coordinate space. */}
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

// ── Bottom-rise confetti ────────────────────────────────────────────────────
//
// A fullscreen Duolingo-style celebration. Many small chips spawn along the
// bottom of the viewport and rise up + outward with rotation, fading at the
// end. Pure CSS via the @keyframes confetti-rise + per-particle custom props.

const CONFETTI_COLORS = [
  '#FFD24C', // warm yellow
  '#4ED371', // forest light
  '#27AE92', // forest mid
  '#FF7A59', // coral
  '#5BB3FF', // sky
  '#F2B5D4', // soft pink
  '#B98AFF', // lavender
];
const BOTTOM_CONFETTI_COUNT = 60;

type BottomParticle = {
  id: number;
  /** Starting horizontal position as % of viewport width. */
  startXPct: number;
  /** Horizontal drift in pixels by the end of the animation. */
  dxPx: number;
  /** Final vertical offset in viewport-height units (negative = up). */
  dyVh: number;
  color: string;
  rotateDeg: number;
  delayMs: number;
  sizePx: number;
  shape: 'square' | 'circle' | 'rect';
};

function BottomConfetti({ durationMs }: { durationMs: number }) {
  const particles = useMemo<BottomParticle[]>(() => {
    const out: BottomParticle[] = [];
    for (let i = 0; i < BOTTOM_CONFETTI_COUNT; i++) {
      // Spawn anywhere along the bottom — slight bias toward the centre so
      // the cloud looks denser in the middle.
      const t = i / (BOTTOM_CONFETTI_COUNT - 1);
      const center = 0.5;
      const startXPct =
        100 *
        (center +
          (t - center) * (0.85 + Math.random() * 0.3) + // ~85-115% spread
          (Math.random() - 0.5) * 0.04); // jitter
      // Each chip drifts horizontally a little — biased away from centre.
      const drift = (startXPct - 50) * 1.2 + (Math.random() - 0.5) * 80;
      // Most go high, some fizzle out earlier.
      const dyVh = -(45 + Math.random() * 55); // -45vh to -100vh
      const shapeRoll = Math.random();
      out.push({
        id: i,
        startXPct: Math.max(2, Math.min(98, startXPct)),
        dxPx: drift,
        dyVh,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotateDeg: (Math.random() - 0.5) * 1080, // up to ±3 spins
        delayMs: Math.random() * 250,
        sizePx: 6 + Math.random() * 6,
        shape:
          shapeRoll < 0.45 ? 'square' : shapeRoll < 0.8 ? 'circle' : 'rect',
      });
    }
    return out;
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none overflow-hidden"
      aria-hidden
    >
      {particles.map((p) => {
        const width =
          p.shape === 'rect' ? p.sizePx * 1.8 : p.sizePx;
        const height = p.sizePx;
        return (
          <span
            key={p.id}
            className="absolute"
            style={{
              left: `${p.startXPct}%`,
              bottom: '-2vh', // start just below the viewport
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: p.color,
              borderRadius:
                p.shape === 'circle' ? '50%' : p.shape === 'rect' ? '1px' : '2px',
              opacity: 0,
              transform: 'translate(-50%, 0)',
              // Custom properties consumed by @keyframes confetti-rise in index.css.
              ['--cf-dx' as string]: `${p.dxPx}px`,
              ['--cf-dy' as string]: `${p.dyVh}vh`,
              ['--cf-rot' as string]: `${p.rotateDeg}deg`,
              animation: `confetti-rise ${durationMs}ms cubic-bezier(0.18, 0.7, 0.45, 1) ${p.delayMs}ms forwards`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Field Modal ──────────────────────────────────────────────────────────────

// ── Planting animation timing ──────────────────────────────────────────────
// One short Duolingo-style burst. The DB write happens immediately on
// click — the celebration is pure visual layered on top.
const PLANT_CELEBRATION_MS = 1800;

type PlantingPhase = 'idle' | 'celebrating';

function TreeFieldModal({
  open,
  onClose,
  totalScore,
  treesPlanted,
  treePlacements,
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
  treePlacements: TreePlacement[];
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
  /** Timer tracking the active celebration so we can cancel it on unmount. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Triggered by the in-modal "plant your tree" button. The DB write fires
  // immediately so the field refreshes (badge +1, fresh sprout at centre)
  // while the bottom-confetti burst plays on top. No tree-growth replay —
  // the celebration is independent of the field state.
  const startPlanting = async () => {
    if (plantingPhase !== 'idle') return; // already celebrating
    if (!isMature) return; // shouldn't happen — button is hidden then

    setPlantingPhase('celebrating');

    // Commit trees_planted++ to Supabase right away. The IsometricField
    // re-renders with the new tree count and centre cycleScore resets, so
    // the user immediately sees the next tree starting from a sprout.
    //
    // We chain .select().maybeSingle() so we can verify the write actually
    // landed — without it, a silently-blocked RLS update returns
    // { data: null, error: null } and the UI never reflects reality.
    if (!userId) {
      console.warn(
        '[TreeFieldModal] no userId — skipping DB write. Confetti will play but trees_planted will NOT increment.',
      );
    } else {
      const targetCount = treesPlanted + 1;
      // Compute the new tree's default placement in the grid the user will
      // see AFTER the increment (in case crossing a tier expands the grid).
      const nextGrid = gridSizeFor(targetCount);
      const defaults = cellsForGrid(nextGrid);
      // Pad existing placements with their resolved cells in the new grid so
      // a tier-expansion crossing stays visually consistent. Then append the
      // new tree's default cell.
      const padded: TreePlacement[] = [];
      for (let k = 0; k < treesPlanted; k++) {
        const [i, j] = placementToCell(nextGrid, k, treePlacements);
        padded.push(cellToPlacement(nextGrid, i, j));
      }
      const [ni, nj] = defaults[treesPlanted] ?? [
        gridCenter(nextGrid),
        gridCenter(nextGrid),
      ];
      padded.push(cellToPlacement(nextGrid, ni, nj));

      // Planting always resets the meter to 0 — any score above the cycle
      // target is forfeited (no carry-over). This matches the user's mental
      // model ("after I plant, I start fresh") and prevents rapid-fire
      // planting when the user has banked score worth several cycles.
      const newFloor = totalScore;
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          trees_planted: targetCount,
          tree_placements: padded,
          cycle_score_floor: newFloor,
        })
        .eq('id', userId)
        .select()
        .maybeSingle();
      if (error) {
        console.error('[TreeFieldModal] failed to bump trees_planted:', error);
      } else if (updated) {
        await onPlanted();
      }
    }

    // End the celebration after the confetti finishes.
    timerRef.current = setTimeout(() => {
      setPlantingPhase('idle');
      timerRef.current = null;
    }, PLANT_CELEBRATION_MS);
  };

  const isAnimating = plantingPhase !== 'idle';

  /**
   * Persist a new placements array to Supabase. Used by the drag-and-drop
   * handler in IsometricField when the user swaps / moves trees. Returns
   * true on success so the field can keep its optimistic update, or false
   * so it can revert.
   */
  const persistPlacements = async (next: TreePlacement[]): Promise<boolean> => {
    if (!userId) return false;
    const { data, error } = await supabase
      .from('profiles')
      .update({ tree_placements: next })
      .eq('id', userId)
      .select()
      .maybeSingle();
    if (error) {
      console.error('[Drag] save failed:', error);
      return false;
    }
    if (!data) return false; // RLS silently rejected
    await onPlanted();
    return true;
  };

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
    <>
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
        className={`w-full max-w-md bg-surface-card rounded-3xl border border-surface-border shadow-2xl max-h-[92vh] overflow-y-auto themed-scroll ${
          isExiting ? 'animate-modal-fall-out' : 'animate-modal-rise-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — close button on the visual left, mission statement
            takes the rest of the row. The mission line replaces the old
            "החלקה שלי" title so the popup reads as a purpose, not a label. */}
        <header className="flex items-start gap-2 px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isAnimating}
            className="shrink-0 p-1 text-ink-300 hover:text-ink-100 disabled:opacity-30 disabled:hover:text-ink-300"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
          <h2 className="flex-1 text-[16px] font-semibold text-ink-100 leading-snug text-center pt-0.5">
            <span className="block">על כל עץ דיגיטלי שתשתול כאן</span>
            <span className="block">
              ישתל עץ אמיתי באפריקה <Emoji emoji="🌱" size={16} />
            </span>
          </h2>
          {/* Spacer the same width as the close button so the title is
              visually centred inside the modal. */}
          <span className="shrink-0 w-[28px]" aria-hidden />
        </header>

        {/* Isometric plot — re-renders naturally on tree count change. */}
        <div className="px-3 pb-1">
          <IsometricField
            treesPlanted={treesPlanted}
            currentStage={stage}
            placements={treePlacements}
            onPlacementsChange={isAnimating ? undefined : persistPlacements}
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


          {/* Action row — when the tree is mature the user sees TWO buttons:
              the planting CTA on the right (RTL) and the dismiss "המשך" on
              the left. Once planted (or if the tree wasn't ready) only the
              "המשך" button shows, full-width. */}
          {isMature && plantingPhase === 'idle' ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={startPlanting}
                className="flex-1 rounded-xl bg-forest-500 hover:bg-forest-400 active:scale-[0.98] transition-all py-3 text-on-accent text-sm font-bold shadow-md flex items-center justify-center gap-1.5 btn-shimmer"
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
              className="mt-3 w-full rounded-xl bg-forest-600 hover:bg-forest-500 active:scale-[0.98] transition-all py-3 text-on-accent text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-wait disabled:active:scale-100"
            >
              המשך
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Fullscreen celebration confetti, rendered on top of the modal so it
        covers the entire viewport. Mounted only during a planting moment. */}
    {plantingPhase === 'celebrating' && (
      <BottomConfetti durationMs={PLANT_CELEBRATION_MS} />
    )}
    </>
  );
}
