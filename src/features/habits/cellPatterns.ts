// ============================================================================
// Cell note patterns — a WHITE texture the user can stamp on a day cell.
// ----------------------------------------------------------------------------
// A cell's `symbol` (in habit_cell_notes) is normally an emoji, but it can
// instead be a pattern token like "pat:stripes". Both the picker (CellNoteSheet)
// and the cell renderer (DayCell) read these definitions, so a pattern always
// looks identical in the popup preview and on the grid. Patterns are always
// white — they overlay the cell's colour (status tint or a chosen note colour).
// ============================================================================
import type { CSSProperties } from 'react';

export type PatternName =
  | 'stripes'
  | 'dots'
  | 'corner'
  | 'bar'
  | 'grid'
  | 'ring'
  | 'split';

// The set the user picked, in display order.
export const PATTERN_NAMES: readonly PatternName[] = [
  'stripes',
  'dots',
  'corner',
  'bar',
  'grid',
  'ring',
  'split',
];

export const PATTERN_PREFIX = 'pat:';

export function patternSymbol(name: PatternName): string {
  return PATTERN_PREFIX + name;
}

/** The pattern encoded in a cell `symbol`, or null if it's an emoji / empty. */
export function patternNameOf(symbol: string | null | undefined): PatternName | null {
  if (!symbol || !symbol.startsWith(PATTERN_PREFIX)) return null;
  const n = symbol.slice(PATTERN_PREFIX.length) as PatternName;
  return PATTERN_NAMES.includes(n) ? n : null;
}

const W = 'rgba(255,255,255,0.92)';
const Wg = 'rgba(255,255,255,0.82)';

/** CSS for one WHITE pattern, laid over a cell as an inset overlay. */
export function patternStyle(name: PatternName): CSSProperties {
  switch (name) {
    case 'stripes':
      return {
        backgroundImage: `repeating-linear-gradient(45deg, ${W} 0 2px, transparent 2px 6px)`,
      };
    case 'dots':
      return {
        backgroundImage: `radial-gradient(${W} 28%, transparent 30%)`,
        backgroundSize: '7px 7px',
      };
    case 'corner':
      return {
        backgroundImage: `linear-gradient(225deg, ${W} 0 34%, transparent 34%)`,
      };
    case 'bar':
      return {
        backgroundImage: `linear-gradient(to top, ${W} 26%, transparent 26%)`,
      };
    case 'grid':
      return {
        backgroundImage: `repeating-linear-gradient(0deg, ${Wg} 0 1.5px, transparent 1.5px 7px), repeating-linear-gradient(90deg, ${Wg} 0 1.5px, transparent 1.5px 7px)`,
      };
    case 'ring':
      return { boxShadow: `inset 0 0 0 2.5px ${W}` };
    case 'split':
      return {
        backgroundImage: `linear-gradient(135deg, ${Wg} 50%, transparent 50%)`,
      };
  }
}
