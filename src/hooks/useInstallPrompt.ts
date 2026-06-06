import { useEffect, useState } from 'react';

// The beforeinstallprompt event isn't in the standard lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Tracks PWA installability across platforms:
//   - Chrome / Edge / Android: capture `beforeinstallprompt` so we can fire
//     the native install dialog on demand.
//   - iOS Safari: no such event — installation is manual (Share → Add to
//     Home Screen), so we surface that via `isIOS`.
//   - Already installed: detected via display-mode standalone.
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBIP = (e: Event) => {
      // Stop Chrome's mini-infobar; we drive the prompt from our own button.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari exposes this non-standard flag when launched from home.
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true);

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios/i.test(navigator.userAgent); // only Safari can A2HS on iOS

  // Returns the outcome so the caller can react (e.g. close a sheet).
  const promptInstall = async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  };

  return {
    /** Native install dialog is available right now. */
    canInstall: !!deferred,
    /** App is already running as an installed PWA. */
    installed: installed || isStandalone,
    isIOS,
    isStandalone,
    promptInstall,
  };
}
