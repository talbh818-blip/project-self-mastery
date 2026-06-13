// ============================================================================
// Vision screen — switches between two independent layouts.
// ----------------------------------------------------------------------------
// The Vision screen ships TWO distinct, separately-maintained layouts:
//   • VisionMobile  — the phone-shaped original (view dropdown, collapsible
//     year-map navigator, editor with a bottom-fixed toolbar).
//   • VisionDesktop — a wide, Google-Docs-style layout (right navigation rail,
//     centred wide writing page, top toolbar).
//
// Both are driven by ONE shared `useVisionController` (which vision is open +
// its persistence), so the data layer can never drift between them — but the
// presentation is fully separate, free to evolve on its own.
//
// A "מחשב / נייד" toggle (hosted in the bottom dock, to the right of the nav
// items) lets desktop users flip between the two. On narrow viewports there is
// only the mobile layout (no toggle).
// ============================================================================
import { useVisionController } from '../features/vision/useVisionController';
import { useVisionLayoutPref } from '../features/vision/useVisionLayoutPref';
import { VisionMobile } from '../features/vision/VisionMobile';
import { VisionDesktop } from '../features/vision/VisionDesktop';

export function Vision() {
  const ctl = useVisionController();
  const { mode } = useVisionLayoutPref();

  if (mode === 'desktop') return <VisionDesktop ctl={ctl} />;

  // Mobile layout stays phone-width and centred, even on a wide screen.
  return (
    <div className="max-w-md mx-auto">
      <VisionMobile ctl={ctl} />
    </div>
  );
}
