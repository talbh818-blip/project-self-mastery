import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function Layout() {
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
      <main className="flex-1 pb-24 max-w-md mx-auto w-full px-3 sm:px-4 pt-3">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
