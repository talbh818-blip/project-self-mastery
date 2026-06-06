// ============================================================================
// PrivacyInline — a single thin row controlling HABITS visibility.
// Vision is always private (no control shown). Three options:
// פרטי (default) / שיתוף ספציפי / פומבי. Saves immediately (optimistic,
// reverts on error).
// ============================================================================
import { useEffect, useState } from 'react';
import { Lock, Users, Globe, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfile } from '../admin/ProfileContext';
import { updateVisibility } from './mutations';
import type { Visibility } from '../admin/types';

// In RTL the first button renders rightmost, so this lays out right→left as
// פרטי · שיתוף ספציפי · פומבי — the order the user reads.
const OPTIONS: { value: Visibility; label: string; icon: LucideIcon }[] = [
  { value: 'private', label: 'פרטי', icon: Lock },
  { value: 'specific', label: 'שיתוף ספציפי', icon: Users },
  { value: 'public', label: 'פומבי', icon: Globe },
];

export function PrivacyInline() {
  const { user } = useAuth();
  const { profile, refresh } = useCurrentProfile();
  const [habits, setHabits] = useState<Visibility>('private');

  useEffect(() => {
    if (!profile) return;
    setHabits(profile.habits_visibility ?? 'private');
  }, [profile?.habits_visibility]);

  if (!profile) return null;

  const save = async (value: Visibility) => {
    if (!user || value === habits) return;
    const prev = habits;
    setHabits(value); // optimistic
    try {
      await updateVisibility(user.id, { habits_visibility: value });
      await refresh();
    } catch (e) {
      setHabits(prev); // revert on failure
      console.error('[privacy] update failed:', e);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl px-3 py-2 flex items-center gap-2">
      <span className="text-xs font-medium text-ink-100 shrink-0">
        פרטיות הרגלים
      </span>
      <div
        role="radiogroup"
        aria-label="פרטיות הרגלים"
        className="flex-1 flex bg-surface-raised rounded-lg p-0.5 gap-0.5"
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = habits === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.label}
              onClick={() => save(opt.value)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] transition-colors ${
                active
                  ? 'bg-forest-700/25 text-cream-50 ring-1 ring-forest-700/50'
                  : 'text-cream-50/55 hover:text-cream-50'
              }`}
            >
              <Icon size={12} className="shrink-0" />
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
