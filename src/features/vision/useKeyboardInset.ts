// ============================================================================
// useKeyboardInset — pixels the on-screen keyboard takes off the bottom
//                    of the visual viewport.
// ----------------------------------------------------------------------------
// On mobile, when the soft keyboard opens, the *layout* viewport stays the
// same height but the *visual* viewport shrinks. We use the difference to
// drive the bottom offset of the fixed editor toolbar so it floats just
// above the keyboard — the way Google Docs / Notes do.
//
// Returns 0 when:
//   • there is no keyboard,
//   • the browser doesn't expose Visual Viewport API (very old browsers).
// ============================================================================
import { useEffect, useState } from 'react';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // `innerHeight - vv.height - vv.offsetTop` is the room taken by the
      // keyboard at the BOTTOM of the layout viewport. Clamp to 0 to
      // ignore the few-px wobble some browsers report on no-keyboard.
      const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(next);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
