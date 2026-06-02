// Animated loading indicator — the compass logo at center, with small dots
// orbiting around it. Replaces the previous plain "טוען…" text everywhere.
//
// Use:
//   <CompassLoader fullscreen />            // for full-page route loading
//   <CompassLoader />                       // for inline content loading
//   <CompassLoader size="sm" />             // for tight inline spots

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
}: {
  size?: Size;
  fullscreen?: boolean;
  className?: string;
}) {
  const { container, logo, dot, radius } = SIZE_MAP[size];

  const spinner = (
    <div
      role="status"
      aria-label="טוען"
      className="relative inline-flex items-center justify-center"
      style={{ width: container, height: container }}
    >
      <img
        src="/logo.png?v=3"
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
            className="absolute rounded-full bg-white"
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
