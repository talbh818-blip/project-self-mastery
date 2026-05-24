import { NavLink } from 'react-router-dom';
import {
  Target,
  BarChart3,
  Shield,
  BookOpen,
  PlayCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

const items: NavItem[] = [
  { to: '/', label: 'הרגלים', icon: Target, end: true },
  { to: '/data', label: 'נתונים', icon: BarChart3 },
  { to: '/blocker', label: 'חוסם', icon: Shield },
  { to: '/vision', label: 'חזון', icon: BookOpen },
  { to: '/course', label: 'קורס', icon: PlayCircle },
  { to: '/participants', label: 'משתתפים', icon: Users },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface-card/95 backdrop-blur border-t border-surface-border pb-safe">
      <ul className="flex items-stretch justify-around max-w-md mx-auto">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 px-1 text-[11px] transition-colors ${
                  isActive ? 'text-forest-500' : 'text-ink-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    className="shrink-0"
                  />
                  <span className={isActive ? 'font-semibold' : 'font-normal'}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
