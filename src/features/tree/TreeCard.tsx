import React, { useEffect, useRef, useState } from 'react';

// ── Growth configuration ─────────────────────────────────────────────────────

/** Minimum cycle-score needed to enter each stage (index = stage). */
const STAGE_THRESHOLDS = [0, 100, 250, 450, 650] as const;

/** Cycle-score at which the tree is "mature" and can be planted. */
const CYCLE_TARGET = 650;

const STAGE_LABELS = ['זרע', 'שתיל', 'עץ צעיר', 'עץ גדל', 'עץ בשל'] as const;

type Stage = 0 | 1 | 2 | 3 | 4;

function stageFor(pts: number): Stage {
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (pts >= STAGE_THRESHOLDS[i]) return i as Stage;
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

/** Stage 3 — young tree with layered canopy and visible roots */
function YoungTree() {
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

/** Stage 4 — full mature tree with glow and sparkle details */
function MatureTree() {
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
  const storageKey = `trees-planted-${userId || 'anon'}`;
  const [treesPlanted, setTreesPlanted] = useState<number>(
    () => Number(localStorage.getItem(storageKey) ?? 0),
  );

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
  /** Points accumulated in this planting cycle. */
  const cycleScore = Math.max(0, totalScore - treesPlanted * CYCLE_TARGET);
  const isMature = cycleScore >= CYCLE_TARGET;
  const stage = stageFor(cycleScore);
  const progressPct = isMature ? 100 : Math.round((cycleScore / CYCLE_TARGET) * 100);

  // Next stage threshold (for "X more pts" label)
  const nextThreshold =
    !isMature
      ? (STAGE_THRESHOLDS.find((t) => t > cycleScore) ?? CYCLE_TARGET)
      : CYCLE_TARGET;
  const ptsToNext = isMature ? 0 : nextThreshold - cycleScore;

  // ── Plant action ─────────────────────────────────────────────────────────
  const handlePlant = () => {
    const next = treesPlanted + 1;
    setTreesPlanted(next);
    localStorage.setItem(storageKey, String(next));
    window.open('https://onetreeplanted.org/products/plant-trees', '_blank');
  };

  const TreeSVGComponent = TREE_BY_STAGE[stage];

  return (
    <div className="mb-3 rounded-2xl border border-surface-border bg-surface-card px-4 py-3 relative overflow-hidden">

      {/* ── First-time tooltip ─────────────────────────────────────────── */}
      {showTooltip && (
        <button
          type="button"
          onClick={() => setShowTooltip(false)}
          className="absolute inset-x-3 top-2 z-10 rounded-xl bg-forest-200/95 backdrop-blur-sm px-3 py-2.5 text-right shadow-lg w-[calc(100%-1.5rem)] text-start"
          aria-label="סגור הסבר"
        >
          <p className="text-sm font-semibold text-ink-100 leading-snug">
            🌱 הניקוד שלך משקה עץ דיגיטלי
          </p>
          <p className="text-[11px] text-ink-300 mt-0.5 leading-relaxed">
            כשהעץ יבשיל — תוכל לשתול עץ אמיתי באפריקה 🌍
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
                <span className="text-forest-400 font-bold">מוכן לשתילה! 🎉</span>
              ) : (
                <span className="text-ink-300">עוד {ptsToNext} נק׳</span>
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
            {STAGE_THRESHOLDS.slice(1).map((threshold) => {
              const pct = (threshold / CYCLE_TARGET) * 100;
              return (
                <span
                  key={threshold}
                  className="absolute top-0 bottom-0 w-px bg-surface-card/60"
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>

          {/* Total score + trees planted counter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-ink-300">ניקוד:</span>
              <span className="text-ink-100 font-semibold tabular-nums">{totalScore}</span>
            </div>
            {treesPlanted > 0 && (
              <span className="text-[10px] text-forest-400 font-medium">
                🌳 {treesPlanted} {treesPlanted === 1 ? 'עץ נשתל' : 'עצים נשתלו'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating score delta (forwarded from parent) ─────────────── */}
      {scoreAnim && (
        <span
          key={`delta-${scoreAnim.key}`}
          aria-hidden="true"
          className={`pointer-events-none absolute left-4 bottom-3 font-bold text-sm tabular-nums ${
            scoreAnim.delta > 0
              ? 'text-forest-500 animate-score-float'
              : 'text-red-400 animate-score-flash-down'
          }`}
        >
          {scoreAnim.delta > 0 ? `+${scoreAnim.delta}` : scoreAnim.delta}
        </span>
      )}

      {/* ── Plant button — appears only when mature ─────────────────── */}
      {isMature && (
        <button
          type="button"
          onClick={handlePlant}
          className="mt-3 w-full rounded-xl bg-forest-600 hover:bg-forest-500 active:scale-95 transition-all py-2.5 text-cream-50 text-sm font-bold flex items-center justify-center gap-2 shadow-md"
        >
          <span>🌍</span>
          <span>שתול עץ אמיתי באפריקה — $1</span>
        </button>
      )}
    </div>
  );
}
