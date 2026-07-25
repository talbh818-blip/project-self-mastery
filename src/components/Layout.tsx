import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from './ErrorBoundary';
import { ProfileProvider } from '../features/admin/ProfileContext';
import { OpenTicketsProvider } from '../features/admin/OpenTicketsContext';
import { BlockedGate } from '../features/admin/BlockedGate';
import { ThemeProvider } from '../hooks/useTheme';
import {
  VisionLayoutProvider,
  useVisionLayoutPref,
} from '../features/vision/useVisionLayoutPref';
import { useReminderScheduler } from '../features/notifications/delivery';

// Routes where the brand header (compass + app name) is hidden. Content-dense
// screens omit it to claim the vertical space — Habits (home), Vision (the
// journaling pyramid + year map) and Features (its own title + view switcher).
// Admin renders its own brand at the top of its right-hand sidebar, so it drops
// the global header too. Other screens keep it for app identity.
const HIDE_BRAND_HEADER_ON: ReadonlySet<string> = new Set([
  '/',
  '/vision',
  '/features',
  '/features/notifications',
  '/admin',
]);

export function Layout() {
  // The shell consumes the layout-mode context (for the Course desktop
  // app-shell), so the provider must wrap it — hence the split into LayoutShell.
  return (
    <ProfileProvider>
      <ThemeProvider>
        <BlockedGate>
          <VisionLayoutProvider>
            <OpenTicketsProvider>
              <LayoutShell />
            </OpenTicketsProvider>
          </VisionLayoutProvider>
        </BlockedGate>
      </ThemeProvider>
    </ProfileProvider>
  );
}

function LayoutShell() {
  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const { mode } = useVisionLayoutPref();

  // App-wide notification scheduler — fires reminders (configured on the
  // "פיצ'רים" screen) at their chosen day/time while the app is open. Lives
  // here so it runs on every tab, not only the Habits screen.
  useReminderScheduler();

  // Course desktop is a FIXED app-shell: the page itself never scrolls; only the
  // book rail (and, if a book has many videos, the video column) scrolls
  // internally. Clamp the whole shell to the viewport height and disable page
  // scroll. Mobile course (and every other screen) keeps the normal document
  // scroll. Only the actual desktop MODE triggers this — a wide viewport left in
  // "נייד" mode still scrolls like a phone.
  const fixedShell = pathname === '/course' && mode === 'desktop';

  // The brand header (compass + app name) is hidden on the content-dense Habits
  // and Vision screens — and on the Course desktop app-shell, which claims the
  // full height for the book rail. Mobile Course still shows it.
  const showBrandHeader = !HIDE_BRAND_HEADER_ON.has(pathname) && !fixedShell;
  // Vision ships a wide desktop layout; the Course desktop layout is wide too.
  // Admin is a two-column dashboard (right sidebar + content) — but only in
  // DESKTOP mode; in mobile mode it narrows to phone width (max-w-md, like every
  // other screen) so the owner can preview the mobile look via the nav toggle.
  // Give the wide routes the FULL width so they can use the whole viewport; each
  // re-constrains its own inner layout, so phones are unaffected.
  const wideContainer =
    pathname === '/vision' ||
    pathname === '/course' ||
    (pathname === '/admin' && mode === 'desktop');

  // Vision desktop is a Docs-style page (the writing card grows down the page).
  // It uses a SMALLER bottom runway than the default pb-24 so that scrolling to
  // the very end leaves only a small gap below the container's edge above the
  // nav — not the full default. Mobile vision / every other screen keeps pb-24.
  const visionDesktop = pathname === '/vision' && mode === 'desktop';

  // On initial load and on every route change, start the viewport just past
  // the brand header so the screen content is what the user sees first.
  // We keep re-applying the scroll until either:
  //   - the user manually scrolls (then we back off and let them be), or
  //   - a short timeout elapses (failsafe against bouncing forever).
  // This handles async content loads that grow the page after mount.
  useLayoutEffect(() => {
    // The fixed app-shell can't scroll at all — keep it parked at the top so the
    // header stays put and never re-applies the past-header scroll below.
    if (fixedShell) {
      window.scrollTo({ top: 0, left: 0 });
      return;
    }

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
  }, [pathname, showBrandHeader, fixedShell]);

  return (
    <div
      className={`flex flex-col bg-surface-base ${
        fixedShell ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      {showBrandHeader && (
        <header ref={headerRef} className="bg-surface-base">
          <div className="max-w-md mx-auto w-full px-4 py-3 flex items-center justify-center gap-2">
            <img
              src="/logo.png?v=5"
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
        className={`flex-1 mx-auto w-full px-3 sm:px-4 pt-5 ${
          wideContainer ? 'max-w-none' : 'max-w-md'
        } ${
          fixedShell
            ? 'overflow-hidden'
            : visionDesktop
              ? 'min-h-screen pb-20'
              : 'pb-24 min-h-screen'
        }`}
      >
        {/* App-wide safety net: a crash on any screen shows a recoverable
            notice instead of a black page. Resets on route change. */}
        <ErrorBoundary
          resetKeys={[pathname]}
          maxRetries={1}
          fallback={(retry) => (
            <div className="text-center py-16">
              <p className="text-ink-100 font-medium">משהו השתבש</p>
              <p className="text-ink-300 text-sm mt-1">
                נסה שוב, או רענן את הדף.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-4 inline-flex items-center h-9 px-4 rounded-lg bg-forest-700 text-on-accent text-sm font-medium hover:bg-forest-600 transition-colors"
              >
                נסה שוב
              </button>
            </div>
          )}
        >
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
