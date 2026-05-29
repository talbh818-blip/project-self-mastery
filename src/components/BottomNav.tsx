import { NavLink } from 'react-router-dom';
import {
  Target,
  BookOpen,
  PlayCircle,
  UserCircle,
  ShieldEllipsis,
  type LucideIcon,
} from 'lucide-react';
import { useCurrentProfile } from '../features/admin/ProfileContext';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

const BASE_ITEMS: NavItem[] = [
  { to: '/', label: 'הרגלים', icon: Target, end: true },
  { to: '/vision', label: 'חזון', icon: BookOpen },
  { to: '/course', label: 'קורס', icon: PlayCircle },
  { to: '/user', label: 'משתמש', icon: UserCircle },
];

const ADMIN_ITEM: NavItem = {
  to: '/admin',
  label: 'ניהול',
  icon: ShieldEllipsis,
};

export function BottomNav() {
  const { isAdmin } = useCurrentProfile();
  // In RTL the first DOM child renders rightmost. "משתמש" is the last BASE
  // item, and the spec asks for "ניהול" to sit to the LEFT of it, so we
  // simply append the admin item at the end of the array.
  const items = isAdmin ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;
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
