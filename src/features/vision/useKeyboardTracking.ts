// ============================================================================
// useKeyboardTracking — glue the editor toolbar to the top of the on-screen
//                       keyboard, smoothly (the Google-Notes effect).
// ----------------------------------------------------------------------------
// WHY A CSS VARIABLE INSTEAD OF REACT STATE:
//   The naive approach (useState + setInset on every visualViewport tick)
//   re-renders the whole editor subtree on every frame the keyboard moves.
//   That re-render latency is exactly what reads as "laggy / jumpy". Here we
//   write the keyboard height straight into a CSS custom property on <html>
//   inside a requestAnimationFrame — zero React renders — and let CSS do the
//   positioning with a GPU-composited `transform`. The toolbar follows the
//   viewport at native speed.
//
// THE FORMULA:
//   keyboardHeight = layoutViewportHeight − visualViewport.height − offsetTop
//   On both iOS Safari and Android Chrome the layout viewport (innerHeight)
//   stays put when the keyboard opens; only the *visual* viewport shrinks,
//   so the difference is the keyboard's height. 0 when no keyboard.
// ============================================================================
import { useEffect } from 'react';

export function useKeyboardTracking(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    let raf = 0;

    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kb = Math.max(
          0,
          window.innerHeight - vv.height - vv.offsetTop,
        );
        root.style.setProperty('--vision-kb', `${kb}px`);
      });
    };

    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      // Reset so other screens never inherit a stale keyboard offset.
      root.style.removeProperty('--vision-kb');
    };
  }, []);
}
