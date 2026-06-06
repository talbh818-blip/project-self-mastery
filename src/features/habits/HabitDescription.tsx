// ============================================================================
// HabitDescription — renders a habit's description in its chosen format:
//   'text'      → a plain paragraph (newlines preserved)
//   'bullets'   → • list
//   'numbers'   → 1. 2. 3. list
//   'checklist' → ☐ list (static — display only)
// Shared so the week-view expander and any future surface (detail sheet, etc.)
// render descriptions identically.
// ============================================================================
import type { DescriptionFormat } from './types';

export function HabitDescription({
  description,
  format,
  className = '',
}: {
  description: string;
  format: DescriptionFormat;
  className?: string;
}) {
  if (format === 'text') {
    return (
      <p
        className={`text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap ${className}`}
      >
        {description}
      </p>
    );
  }

  const items = description
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <ul className={`space-y-1 ${className}`}>
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-[13px] text-white/90 leading-snug"
        >
          <span className="shrink-0 text-white/60 tabular-nums mt-px select-none">
            {format === 'bullets' ? '•' : format === 'numbers' ? `${i + 1}.` : '☐'}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
