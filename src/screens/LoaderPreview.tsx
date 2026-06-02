// Temporary preview page for the CompassLoader — lets you eyeball every
// size variant in one place without waiting for a real loading state.
// Reachable at /loader-preview. Remove this file (and the route in App.tsx)
// once the loader is signed off on.
import { CompassLoader } from '../components/CompassLoader';

export function LoaderPreview() {
  return (
    <div className="min-h-screen bg-surface-base text-ink-100 p-6 flex flex-col items-center">
      <h1 className="text-2xl font-semibold mb-2">תצוגה מקדימה — לואדר</h1>
      <p className="text-ink-300 text-sm mb-10 text-center max-w-md">
        זהו עמוד זמני להצגת גדלי הלואדר. ה-fullscreen למטה בכפתור נפרד.
      </p>

      <div className="flex flex-col gap-10 items-center w-full max-w-2xl">
        <PreviewBlock title="גדול (lg) — לטעינת מסך מלא" size="lg" />
        <PreviewBlock title="בינוני (md) — לתוך מסך / כרטיס" size="md" />
        <PreviewBlock title="קטן (sm) — לחללים צרים" size="sm" />
      </div>

      <div className="mt-12 flex flex-col gap-3 items-center">
        <p className="text-ink-300 text-sm">לראות איך זה נראה fullscreen?</p>
        <FullscreenDemo />
      </div>
    </div>
  );
}

function PreviewBlock({ title, size }: { title: string; size: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="w-full">
      <p className="text-ink-300 text-sm mb-3 text-center">{title}</p>
      <div className="rounded-2xl bg-surface-card border border-surface-border py-10 flex items-center justify-center">
        <CompassLoader size={size} />
      </div>
    </div>
  );
}

function FullscreenDemo() {
  const showFullscreen = () => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--color-surface-base);cursor:pointer;';
    overlay.title = 'לחץ לסגירה';

    // Mirror the CompassLoader lg markup so we don't need a portal.
    const SIZE = { container: 140, logo: 72, dot: 5, radius: 62 };
    const box = document.createElement('div');
    box.style.cssText = `position:relative;display:inline-flex;align-items:center;justify-content:center;width:${SIZE.container}px;height:${SIZE.container}px;`;
    const img = document.createElement('img');
    img.src = '/logo.png?v=3';
    img.style.cssText = `width:${SIZE.logo}px;height:${SIZE.logo}px;pointer-events:none;user-select:none;`;
    box.appendChild(img);
    const N = 12;
    const D = 1.2;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * 360;
      const delay = -(i / N) * D;
      const dot = document.createElement('span');
      dot.style.cssText = `position:absolute;width:${SIZE.dot}px;height:${SIZE.dot}px;border-radius:9999px;background:#ffffff;left:50%;top:50%;margin-left:${-SIZE.dot / 2}px;margin-top:${-SIZE.dot / 2}px;transform:rotate(${angle}deg) translate(0,-${SIZE.radius}px);animation:compass-loader-dot ${D}s linear ${delay}s infinite;`;
      box.appendChild(dot);
    }

    const hint = document.createElement('div');
    hint.textContent = 'לחץ כדי לסגור';
    hint.style.cssText =
      'position:absolute;bottom:24px;left:0;right:0;text-align:center;font-size:13px;color:var(--color-ink-300);';
    overlay.appendChild(box);
    overlay.appendChild(hint);

    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  };

  return (
    <button
      onClick={showFullscreen}
      className="bg-forest-700 hover:bg-forest-800 active:bg-forest-900 text-cream-50 font-medium px-6 py-2.5 rounded-2xl transition-colors"
    >
      הצג fullscreen
    </button>
  );
}
