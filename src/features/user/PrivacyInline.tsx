// ============================================================================
// PrivacyInline — visibility controls rendered directly on the User screen
// (no modal). Two rows (vision, habits), each a 3-way segmented selector:
// ציבורי / ספציפי / פרטי. Selecting an option saves immediately
// (optimistic, reverts on error).
// ============================================================================
import { useEffect, useState } from 'react';
import { Globe, Users, Lock, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfile } from '../admin/ProfileContext';
import { updateVisibility } from './mutations';
import type { Visibility } from '../admin/types';

// Order matters: in RTL the first button renders rightmost, so this lays out
// as ציבורי (right) · ספציפי (mid) · פרטי (left) — the order the user reads.
const OPTIONS: { value: Visibility; label: string; icon: LucideIcon }[] = [
  { value: 'public', label: 'ציבורי', icon: Globe },
  { value: 'specific', label: 'ספציפי', icon: Users },
  { value: 'private', label: 'פרטי', icon: Lock },
];

export function PrivacyInline() {
  const { user } = useAuth();
  const { profile, refresh } = useCurrentProfile();
  const [vision, setVision] = useState<Visibility>('private');
  const [habits, setHabits] = useState<Visibility>('private');

  useEffect(() => {
    if (!profile) return;
    setVision(profile.vision_visibility ?? 'private');
    setHabits(profile.habits_visibility ?? 'private');
  }, [profile?.vision_visibility, profile?.habits_visibility]);

  if (!profile) return null;

  const save = async (
    field: 'vision_visibility' | 'habits_visibility',
    value: Visibility,
    setLocal: (v: Visibility) => void,
    prev: Visibility,
  ) => {
    if (!user || value === prev) return;
    setLocal(value); // optimistic
    try {
      await updateVisibility(user.id, { [field]: value });
      await refresh();
    } catch (e) {
      setLocal(prev); // revert on failure
      console.error('[privacy] update failed:', e);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl p-3 flex items-stretch gap-2">
      <Segmented
        label="פרטיות חזון"
        value={vision}
        onChange={(v) => save('vision_visibility', v, setVision, vision)}
      />
      <div className="w-px bg-surface-border shrink-0" />
      <Segmented
        label="פרטיות הרגלים"
        value={habits}
        onChange={(v) => save('habits_visibility', v, setHabits, habits)}
      />
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-medium text-ink-100 mb-1.5 text-center truncate">
        {label}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex bg-surface-raised rounded-lg p-0.5 gap-0.5"
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.label}
              onClick={() => onChange(opt.value)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[9px] leading-none transition-colors ${
                active
                  ? 'bg-forest-700 text-cream-50'
                  : 'text-ink-300 hover:text-ink-100'
              }`}
            >
              <Icon size={13} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
