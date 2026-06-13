// ============================================================================
// VisionLayoutToggle — the desktop-only "מחשב / נייד" switch.
// ----------------------------------------------------------------------------
// A small segmented control shown at the TOP-RIGHT of the Vision screen on wide
// viewports only. Lets the user flip between the two distinct layouts. Hidden
// entirely on narrow screens (there only the mobile layout exists), so the
// parent decides whether to render it.
// ============================================================================
import { Monitor, Smartphone } from 'lucide-react';
import type { VisionLayoutMode } from './useVisionLayoutPref';

const OPTIONS: { mode: VisionLayoutMode; label: string; Icon: typeof Monitor }[] =
  [
    { mode: 'desktop', label: 'מחשב', Icon: Monitor },
    { mode: 'mobile', label: 'נייד', Icon: Smartphone },
  ];

export function VisionLayoutToggle({
  mode,
  onChange,
}: {
  mode: VisionLayoutMode;
  onChange: (mode: VisionLayoutMode) => void;
}) {
  return (
    <div
      dir="rtl"
      role="group"
      aria-label="תצוגת מחשב או נייד"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-raised ring-1 ring-surface-border"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={active}
            className={`
              inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px]
              font-semibold transition-colors
              ${
                active
                  ? 'bg-forest-700 text-on-accent shadow-sm'
                  : 'text-ink-300 hover:text-ink-100'
              }
            `}
          >
            <Icon size={14} strokeWidth={2.1} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
