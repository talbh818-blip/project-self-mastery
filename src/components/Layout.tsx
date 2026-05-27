import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function Layout() {
  const headerRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // On initial load and on every route change, start the viewport just past
  // the brand header so the screen content is what the user sees first.
  // Scrolling back up still reveals the header.
  useLayoutEffect(() => {
    const h = headerRef.current?.offsetHeight ?? 0;
    window.scrollTo({ top: h, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  // Re-apply after the logo image loads, since its dimensions may shift the
  // header height a few pixels and we want the bottom edge of the header to
  // be exactly at the top of the viewport.
  useEffect(() => {
    const img = headerRef.current?.querySelector('img');
    if (!img || img.complete) return;
    const onLoad = () => {
      const h = headerRef.current?.offsetHeight ?? 0;
      if (window.scrollY < h) {
        window.scrollTo({ top: h, left: 0, behavior: 'instant' as ScrollBehavior });
      }
    };
    img.addEventListener('load', onLoad, { once: true });
    return () => img.removeEventListener('load', onLoad);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
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
      <main className="flex-1 pb-24 max-w-md mx-auto w-full px-3 sm:px-4 pt-3">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
