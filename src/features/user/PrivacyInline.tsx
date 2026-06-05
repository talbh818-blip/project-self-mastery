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
    <div className="bg-surface-card rounded-2xl p-5 space-y-4">
      <Segmented
        label="פרטיות חזון"
        value={vision}
        onChange={(v) => save('vision_visibility', v, setVision, vision)}
      />
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
    <div>
      <div className="text-sm font-medium text-ink-100 mb-2">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex bg-surface-raised rounded-xl p-1 gap-1"
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
              onClick={() => onChange(opt.value)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] transition-colors ${
                active
                  ? 'bg-forest-700 text-cream-50'
                  : 'text-ink-300 hover:text-ink-100'
              }`}
            >
              <Icon size={16} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
