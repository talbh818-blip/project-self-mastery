import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

const SCREEN_TITLES: Record<string, string> = {
  '/': 'הרגלים',
  '/blocker': 'חוסם',
  '/vision': 'חזון',
  '/course': 'קורס',
  '/participants': 'משתמש',
};

export function Layout() {
  const { pathname } = useLocation();
  const screenTitle = SCREEN_TITLES[pathname] ?? '';

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="bg-surface-base">
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
      <div className="sticky top-0 z-10 bg-surface-card/95 backdrop-blur border-b border-surface-border">
        <div className="max-w-md mx-auto w-full px-4 h-10 flex items-center justify-center">
          <span className="text-sm font-semibold text-ink-100 tracking-tight">
            {screenTitle}
          </span>
        </div>
      </div>
      <main className="flex-1 pb-24 max-w-md mx-auto w-full px-3 sm:px-4 pt-3">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
