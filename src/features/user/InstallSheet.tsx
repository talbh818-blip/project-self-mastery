// ============================================================================
// InstallSheet — shown when the user taps "התקן אפליקציה" and the native
// install dialog isn't directly available (iOS, or already installed, or an
// unsupported browser). Gives platform-appropriate guidance.
// ============================================================================
import { useEffect } from 'react';
import { X, Share, Check, Download } from 'lucide-react';

type Props = {
  open: boolean;
  isIOS: boolean;
  installed: boolean;
  onClose: () => void;
};

export function InstallSheet({ open, isIOS, installed, onClose }: Props) {
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
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col animate-modal-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
            type="button"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">התקנת האפליקציה</h2>
          <div className="w-7" />
        </header>

        <div className="px-5 py-5 space-y-4">
          {installed ? (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <span className="w-12 h-12 rounded-full bg-forest-700/20 flex items-center justify-center">
                <Check size={28} className="text-forest-500" />
              </span>
              <p className="text-ink-100 font-medium">האפליקציה כבר מותקנת ✓</p>
              <p className="text-ink-300 text-xs">
                אתה משתמש בגרסה המותקנת על המכשיר.
              </p>
            </div>
          ) : isIOS ? (
            <>
              <p className="text-sm text-ink-100">
                כדי להתקין על האייפון/אייפד:
              </p>
              <ol className="space-y-3 text-sm text-ink-300">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-surface-raised text-ink-100 text-[11px] flex items-center justify-center">
                    1
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    לחץ על כפתור השיתוף
                    <Share size={15} className="inline text-forest-500" />
                    בתחתית הדפדפן (Safari).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-surface-raised text-ink-100 text-[11px] flex items-center justify-center">
                    2
                  </span>
                  <span>גלול ובחר "הוסף למסך הבית" (Add to Home Screen).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-surface-raised text-ink-100 text-[11px] flex items-center justify-center">
                    3
                  </span>
                  <span>אשר — והאפליקציה תופיע על מסך הבית.</span>
                </li>
              </ol>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center text-center gap-2 pb-1">
                <span className="w-12 h-12 rounded-full bg-forest-700/20 flex items-center justify-center">
                  <Download size={26} className="text-forest-500" />
                </span>
              </div>
              <p className="text-sm text-ink-100">להתקנה במחשב או באנדרואיד:</p>
              <ol className="space-y-3 text-sm text-ink-300">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-surface-raised text-ink-100 text-[11px] flex items-center justify-center">
                    1
                  </span>
                  <span>
                    פתח את תפריט הדפדפן (⋮ בפינה) או חפש אייקון התקנה בשורת
                    הכתובת.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-surface-raised text-ink-100 text-[11px] flex items-center justify-center">
                    2
                  </span>
                  <span>בחר "התקן אפליקציה" / "Install app".</span>
                </li>
              </ol>
              <p className="text-[11px] text-ink-500">
                אם האפשרות לא מופיעה, ייתכן שהאפליקציה כבר מותקנת או שהדפדפן אינו
                תומך בהתקנה.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
