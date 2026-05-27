import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

// Routes where the brand header (compass + app name) is hidden. The Habits
// screen is content-dense on mobile, so the header is omitted there; other
// screens still show it so the app keeps its identity outside Home.
const HIDE_BRAND_HEADER_ON: ReadonlySet<string> = new Set(['/']);

export function Layout() {
  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const showBrandHeader = !HIDE_BRAND_HEADER_ON.has(pathname);

  // On initial load and on every route change, start the viewport just past
  // the brand header so the screen content is what the user sees first.
  // We keep re-applying the scroll until either:
  //   - the user manually scrolls (then we back off and let them be), or
  //   - a short timeout elapses (failsafe against bouncing forever).
  // This handles async content loads that grow the page after mount.
  useLayoutEffect(() => {
    // When the brand header isn't rendered, there's nothing to scroll past.
    if (!showBrandHeader) {
      window.scrollTo({ top: 0, left: 0 });
      return;
    }

    let userScrolled = false;
    let lastApplied = -1;

    const headerHeight = () => headerRef.current?.offsetHeight ?? 0;

    const apply = () => {
      if (userScrolled) return;
      const h = headerHeight();
      if (h <= 0) return;
      // Re-apply if the current scrollY is significantly off our target
      // (e.g. content just loaded and bumped layout).
      if (Math.abs(window.scrollY - h) > 1) {
        window.scrollTo({ top: h, left: 0 });
        lastApplied = h;
      } else {
        lastApplied = h;
      }
    };

    const onScroll = () => {
      // Treat any scroll that doesn't match our last programmatic value as
      // a user-initiated scroll.
      if (lastApplied < 0) return;
      if (Math.abs(window.scrollY - lastApplied) > 2) {
        userScrolled = true;
      }
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => apply());
    if (mainRef.current) ro.observe(mainRef.current);
    if (headerRef.current) ro.observe(headerRef.current);

    const stopTimer = window.setTimeout(() => {
      userScrolled = true;
    }, 1500);

    return () => {
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
      window.clearTimeout(stopTimer);
    };
  }, [pathname, showBrandHeader]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      {showBrandHeader && (
        <header ref={headerRef} className="bg-surface-base">
          <div className="max-w-md mx-auto w-full px-4 py-3 flex items-center justify-center gap-2">
            <img
              src="/logo.png?v=3"
              alt=""
              className="w-8 h-8"
            />
            <span className="text-base font-semibold text-ink-100 tracking-tight">
              פרויקט מחויבות לעצמי
            </span>
          </div>
        </header>
      )}
      <main
        ref={mainRef}
        className="flex-1 pb-24 max-w-md mx-auto w-full px-3 sm:px-4 pt-5 min-h-screen"
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
