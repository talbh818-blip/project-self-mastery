import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <header className="sticky top-0 z-10 bg-surface-card/95 backdrop-blur border-b border-surface-border">
        <div className="max-w-md mx-auto w-full px-4 py-2.5 flex items-center justify-center gap-2">
          <img
            src="/logo.jpg"
            alt=""
            className="w-6 h-6 rounded-md"
          />
          <span className="text-sm font-semibold text-ink-100 tracking-tight">
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
