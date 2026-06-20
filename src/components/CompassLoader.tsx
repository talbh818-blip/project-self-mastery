// Animated loading indicator — the compass logo at center, with small dots
// orbiting around it. Replaces the previous plain "טוען…" text everywhere.
//
// Use:
//   <CompassLoader fullscreen />            // for full-page route loading
//   <CompassLoader />                       // for inline content loading
//   <CompassLoader size="sm" />             // for tight inline spots
//
// ANTI-FLASH DELAY: an inline loader renders NOTHING for its first ~500ms and
// only then reveals the spinner. The vast majority of loads (cache hits, quick
// fetches) finish inside that window — the parent unmounts this component
// before the timer fires, so the user never sees a spinner flash on a fast
// screen switch. Only a genuinely slow load (>500ms) ever shows it. Fullscreen
// loaders (app boot / auth) default to NO delay — there's nothing else on
// screen, so immediate feedback is right. Override per call site via `delayMs`.

import { useEffect, useState } from 'react';

type Size = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<Size, { container: number; logo: number; dot: number; radius: number }> = {
  sm: { container: 56, logo: 28, dot: 3, radius: 24 },
  md: { container: 96, logo: 48, dot: 4, radius: 42 },
  lg: { container: 140, logo: 72, dot: 5, radius: 62 },
};

const DOT_COUNT = 12;
const DURATION_S = 1.2;

export function CompassLoader({
  size = 'md',
  fullscreen = false,
  className = '',
  delayMs,
}: {
  size?: Size;
  fullscreen?: boolean;
  className?: string;
  /** Wait this long before revealing the spinner (anti-flash). Defaults to
   *  0 for fullscreen (boot/auth) and 500ms for inline content loaders. */
  delayMs?: number;
}) {
  const { container, logo, dot, radius } = SIZE_MAP[size];

  const effectiveDelay = delayMs ?? (fullscreen ? 0 : 500);
  const [visible, setVisible] = useState(effectiveDelay === 0);
  useEffect(() => {
    if (effectiveDelay === 0) return;
    setVisible(false);
    const t = window.setTimeout(() => setVisible(true), effectiveDelay);
    return () => window.clearTimeout(t);
  }, [effectiveDelay]);

  // Still inside the anti-flash window — render nothing so a fast load never
  // flashes a spinner. We keep an empty box of the same footprint so the
  // surrounding layout doesn't jump when the spinner does appear.
  if (!visible) {
    if (fullscreen) return <div className={`min-h-screen ${className}`} />;
    return (
      <div
        className={`flex items-center justify-center w-full ${className}`}
        style={{ minHeight: container }}
        aria-hidden="true"
      />
    );
  }

  const spinner = (
    <div
      role="status"
      aria-label="טוען"
      className="relative inline-flex items-center justify-center"
      style={{ width: container, height: container }}
    >
      <img
        src="/logo.png?v=5"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="select-none pointer-events-none"
        style={{ width: logo, height: logo }}
      />
      {Array.from({ length: DOT_COUNT }).map((_, i) => {
        const angle = (i / DOT_COUNT) * 360;
        // Negative delays stagger the dots inside one cycle so the bright
        // peak appears to travel clockwise around the ring.
        const delay = -(i / DOT_COUNT) * DURATION_S;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="absolute rounded-full bg-forest-700"
            style={{
              width: dot,
              height: dot,
              left: '50%',
              top: '50%',
              marginLeft: -dot / 2,
              marginTop: -dot / 2,
              transform: `rotate(${angle}deg) translate(0, -${radius}px)`,
              animation: `compass-loader-dot ${DURATION_S}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );

  if (fullscreen) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-surface-base ${className}`}>
        {spinner}
      </div>
    );
  }

  return <div className={`flex items-center justify-center w-full ${className}`}>{spinner}</div>;
}
