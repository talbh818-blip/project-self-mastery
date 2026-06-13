// ============================================================================
// VisionLayoutProvider / useVisionLayoutPref — desktop vs mobile layout choice.
// ----------------------------------------------------------------------------
// The Vision screen ships TWO distinct layouts (phone-shaped MOBILE and wide
// DESKTOP). The choice is SHARED state, because two places read/write it:
//   • the Vision screen itself (which layout to render), and
//   • the bottom nav (which hosts the "מחשב / נייד" toggle, on wide screens).
// A context keeps them in lock-step — a flip in the bottom nav re-renders the
// Vision screen instantly.
//
// The desktop layout only makes sense on a wide viewport, so:
//   • NARROW viewport → mode forced to 'mobile', toggle hidden.
//   • WIDE viewport   → the user picks; a fresh wide user defaults to 'desktop'.
// The preference is per-device (single localStorage key) — it's about the
// screen you're at, not the account.
// ============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type VisionLayoutMode = 'desktop' | 'mobile';

// Below this width the desktop layout is never offered.
const WIDE_QUERY = '(min-width: 1024px)';
const LS_KEY = 'vision-layout-mode';

function readSaved(): VisionLayoutMode | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'desktop' || v === 'mobile' ? v : null;
  } catch {
    return null;
  }
}

type VisionLayoutValue = {
  mode: VisionLayoutMode;
  isWide: boolean;
  setMode: (mode: VisionLayoutMode) => void;
};

const VisionLayoutContext = createContext<VisionLayoutValue | null>(null);

export function VisionLayoutProvider({ children }: { children: ReactNode }) {
  const [isWide, setIsWide] = useState<boolean>(() => {
    try {
      return window.matchMedia(WIDE_QUERY).matches;
    } catch {
      return false;
    }
  });
  const [saved, setSaved] = useState<VisionLayoutMode | null>(() => readSaved());

  // Track viewport width changes (resize / rotate) so the toggle appears and
  // the mode flips the instant the screen crosses the breakpoint.
  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(WIDE_QUERY);
    } catch {
      return;
    }
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((mode: VisionLayoutMode) => {
    setSaved(mode);
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {
      // private-mode / quota — preference just won't persist.
    }
  }, []);

  // Resolved mode: narrow screens are always mobile; wide screens honour the
  // saved choice, defaulting to desktop for a brand-new wide user.
  const mode: VisionLayoutMode = isWide ? saved ?? 'desktop' : 'mobile';

  return (
    <VisionLayoutContext.Provider value={{ mode, isWide, setMode }}>
      {children}
    </VisionLayoutContext.Provider>
  );
}

export function useVisionLayoutPref(): VisionLayoutValue {
  const ctx = useContext(VisionLayoutContext);
  if (!ctx) {
    throw new Error('useVisionLayoutPref must be used within VisionLayoutProvider');
  }
  return ctx;
}
