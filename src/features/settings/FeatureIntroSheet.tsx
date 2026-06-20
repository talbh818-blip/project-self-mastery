// ============================================================================
// FeatureIntroSheet — a small bottom sheet that holds a feature's on/off toggle
// "inside" it (instead of on the card), plus a button to open where the feature
// lives. Used by features that don't have a full settings screen of their own
// (e.g. "כתיבה יומית"); notifications keep their dedicated settings screen.
// ============================================================================
import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** The coloured feature logo block (a rendered <FeatureLogo/>). */
  glyph: ReactNode;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** Label + action for the "go to the feature" button. */
  openLabel: string;
  onOpenFeature: () => void;
};

export function FeatureIntroSheet({
  open,
  onClose,
  title,
  description,
  glyph,
  enabled,
  onToggle,
  openLabel,
  onOpenFeature,
}: Props) {
  // Lock background scroll while open (matches the other sheets).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-end px-5 pt-4">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
        </header>

        <div className="px-5 pb-5 -mt-2">
          {/* Identity */}
          <div className="flex flex-col items-center text-center mb-5">
            {glyph}
            <h2 className="text-lg font-semibold text-ink-100 mt-2">{title}</h2>
            <p className="text-[13px] text-ink-300 mt-1 leading-snug max-w-xs">
              {description}
            </p>
          </div>

          {/* Master toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onToggle(!enabled)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-raised/40 px-4 py-3.5 text-right"
          >
            <span className="text-sm font-medium text-ink-100">
              {enabled ? 'הפיצ\'ר פעיל' : 'הפעל את הפיצ\'ר'}
            </span>
            <span
              aria-hidden
              className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                enabled ? 'bg-forest-700' : 'bg-surface-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  enabled ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

          {/* Open the feature */}
          <button
            type="button"
            onClick={onOpenFeature}
            className="mt-3 w-full py-3 rounded-2xl bg-forest-700 hover:bg-forest-600 text-cream-50 font-medium transition-colors flex items-center justify-center gap-2"
          >
            {openLabel}
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
