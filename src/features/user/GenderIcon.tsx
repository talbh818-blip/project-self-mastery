// ============================================================================
// GenderIcon — Lucide-style ♂ / ♀ glyphs (lucide-react in this version ships
// no Mars/Venus). 24×24 viewBox, currentColor stroke so callers control the
// colour (blue for male, pink for female in the directory).
// ============================================================================
import type { Gender } from '../admin/types';

export function MaleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="14" r="6" />
      <path d="M14.5 9.5 19 5" />
      <path d="M15 5h4v4" />
    </svg>
  );
}

export function FemaleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M12 14v8" />
      <path d="M9 19h6" />
    </svg>
  );
}

// Coloured gender badge: blue ♂ / pink ♀. Renders nothing when gender is null.
export function GenderIcon({
  gender,
  size = 14,
}: {
  gender: Gender | null;
  size?: number;
}) {
  if (gender === 'male') {
    return (
      <span className="text-sky-400 shrink-0" aria-label="זכר" title="זכר">
        <MaleGlyph size={size} />
      </span>
    );
  }
  if (gender === 'female') {
    return (
      <span className="text-pink-400 shrink-0" aria-label="נקבה" title="נקבה">
        <FemaleGlyph size={size} />
      </span>
    );
  }
  return null;
}
