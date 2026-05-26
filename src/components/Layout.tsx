import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="sticky top-0 z-10 bg-surface-card/95 backdrop-blur border-b border-surface-border">
        <div className="max-w-md mx-auto w-full px-4 py-3 flex items-center justify-center gap-2.5">
          <img
            src="/logo.png?v=2"
            alt=""
            className="w-9 h-9"
          />
          <span className="text-lg font-semibold text-ink-100 tracking-tight">
            פרויקט מחויבות לעצמי
          </span>
        </div>
      </header>
      <main className="flex-1 pb-24 max-w-md mx-auto w-full px-4 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
