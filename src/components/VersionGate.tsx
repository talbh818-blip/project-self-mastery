// ============================================================================
// VersionGate — guarantees users run the latest deployed build.
// ----------------------------------------------------------------------------
// On startup, when the app regains focus, and on a slow interval, it asks the
// server (via /version.json) whether a newer build exists. If so it shows a
// blocking full-screen prompt the user must act on to continue — so nobody
// stays stuck on a stale cached version after a deploy.
//
// Renders nothing while the app is up to date.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { forceAppUpdate, isNewVersionAvailable } from '../lib/appUpdate';
import { Emoji } from './Emoji';

// How often to re-check while the app stays open (10 min). The startup +
// focus checks do most of the work; this catches very long-lived sessions.
const POLL_MS = 10 * 60 * 1000;

export function VersionGate() {
  const [outdated, setOutdated] = useState(false);
  const [updating, setUpdating] = useState(false);

  const check = useCallback(async () => {
    if (await isNewVersionAvailable()) setOutdated(true);
  }, []);

  useEffect(() => {
    // Initial check shortly after mount (let the first paint settle).
    const t = window.setTimeout(check, 1500);

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    const interval = window.setInterval(check, POLL_MS);

    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  if (!outdated) return null;

  const handleUpdate = async () => {
    setUpdating(true);
    await forceAppUpdate(); // reloads the page
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-base/95 backdrop-blur-sm p-6"
      role="alertdialog"
      aria-modal="true"
      dir="rtl"
    >
      <div className="w-full max-w-sm bg-surface-card rounded-3xl shadow-xl p-6 text-center flex flex-col items-center gap-4">
        <span className="w-14 h-14 rounded-full bg-forest-700/20 flex items-center justify-center">
          <RefreshCw
            size={28}
            className={`text-forest-500 ${updating ? 'animate-spin' : ''}`}
          />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-ink-100 inline-flex items-center justify-center gap-1.5">
            יצאה גרסה חדשה! <Emoji emoji="🎉" size={20} />
          </h2>
          <p className="text-sm text-ink-300">
            כדי להמשיך, יש לעדכן לגרסה האחרונה של האפליקציה.
          </p>
        </div>
        {/* Shimmer sweep matches the "שתול את העץ שלך" button so this CTA
            reads as the same "celebrate + click me" moment. The shimmer
            class adds the relative/overflow/isolate the sweep ::before
            needs — see index.css. */}
        <button
          type="button"
          onClick={handleUpdate}
          disabled={updating}
          className="btn-shimmer w-full bg-forest-700 text-on-accent font-bold rounded-xl py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
        >
          <RefreshCw size={18} className={updating ? 'animate-spin' : ''} />
          {updating ? 'מעדכן…' : 'עדכן עכשיו'}
        </button>
      </div>
    </div>
  );
}
