import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <main className="flex-1 pb-24 max-w-md mx-auto w-full px-4 pt-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
