import { useEffect, useRef, useState } from 'react';

// Total number of evolution stages — must match the count of files
// public/sprites/sasuke-NN.png produced by assets/sprites/extract_sprites.py.
const TOTAL_STAGES = 24;

// vCount=0 → stage 1 (starting form). Each V advances one stage. Capped at TOTAL_STAGES.
function stageForVCount(vCount: number): number {
  const stage = Math.max(1, Math.min(TOTAL_STAGES, vCount + 1));
  return stage;
}

function spritePath(stage: number): string {
  return `/sprites/sasuke-${String(stage).padStart(2, '0')}.png`;
}

type Props = {
  vCount: number;
};

// ----------------------------------------------------------------------------
// EvolutionAvatar — the gamification piece. Renders the user's current
// "evolution" sprite based on how many V marks they've logged across all
// habits. When the stage advances, the new sprite briefly scales+pulses to
// reward the user.
// ----------------------------------------------------------------------------
export function EvolutionAvatar({ vCount }: Props) {
  const stage = stageForVCount(vCount);
  const isMax = stage >= TOTAL_STAGES;

  // Track previous stage so we can pulse on level-up.
  const prevStageRef = useRef(stage);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (stage > prevStageRef.current) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 900);
      return () => clearTimeout(t);
    }
    prevStageRef.current = stage;
  }, [stage]);

  // After the pulse ends, sync the ref so we don't pulse again on re-render.
  useEffect(() => {
    if (!pulsing) prevStageRef.current = stage;
  }, [pulsing, stage]);

  return (
    <div className="mt-4 rounded-2xl border border-surface-border bg-surface-card px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] tracking-wide text-ink-500">דמות אישית</div>
        <div className="text-[11px] text-ink-300">
          רמה <span className="font-bold text-ink-100">{stage}</span>
          <span className="text-ink-500"> / {TOTAL_STAGES}</span>
          {isMax && <span className="mr-1 text-forest-500">· מקס׳</span>}
        </div>
      </div>

      {/* Sprite stage. Pixel-art so we want sharp scaling, not smoothing. */}
      <div className="flex items-end justify-center h-[180px] relative">
        <img
          key={stage}
          src={spritePath(stage)}
          alt={`רמת התפתחות ${stage}`}
          className={`max-h-[170px] w-auto transition-transform duration-500 ${
            pulsing ? 'animate-evolution-pulse' : ''
          }`}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
        {pulsing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-forest-500 text-sm font-bold animate-fade-out">
              +רמה!
            </span>
          </div>
        )}
      </div>

      {/* Subtle progress hint — next level needs 1 more V. */}
      {!isMax && (
        <div className="mt-2 text-center text-[10px] text-ink-500">
          עוד V אחד = רמה הבאה
        </div>
      )}
    </div>
  );
}
