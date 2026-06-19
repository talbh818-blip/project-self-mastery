// ============================================================================
// PrivacySettingsSheet — lets the user pick visibility for vision + habits
// independently. 'private' (default), 'public', or 'specific'. The
// 'specific' choice persists the value but the picker for *which* users
// can see is V2; for now selecting 'specific' is informational.
// ============================================================================
import { useEffect, useState } from 'react';
import { X, Lock, Globe, Users, Check, BookOpen, Target } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCurrentProfile } from '../admin/ProfileContext';
import { updateVisibility } from './mutations';
import type { Visibility } from '../admin/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

const OPTIONS: { value: Visibility; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'private',  label: 'פרטי',                icon: <Lock size={16} />,  hint: 'רק אני רואה' },
  { value: 'public',   label: 'משותף עם כולם',        icon: <Globe size={16} />, hint: 'כל המשתתפים יוכלו לראות' },
  { value: 'specific', label: 'משותף עם משתמשים ספציפיים', icon: <Users size={16} />, hint: 'תוכל לבחור בהמשך' },
];

export function PrivacySettingsSheet({ open, onClose }: Props) {
  const { user } = useAuth();
  const { profile, refresh } = useCurrentProfile();

  const [vision, setVision] = useState<Visibility>('private');
  const [habits, setHabits] = useState<Visibility>('private');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !profile) return;
    setVision(profile.vision_visibility ?? 'private');
    setHabits(profile.habits_visibility ?? 'private');
    setSaving(false);
    setSaved(false);
    setError(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, profile?.id]);

  if (!open || !profile) return null;

  const dirty =
    vision !== (profile.vision_visibility ?? 'private') ||
    habits !== (profile.habits_visibility ?? 'private');

  const handleSave = async () => {
    if (!user || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateVisibility(user.id, {
        vision_visibility: vision,
        habits_visibility: habits,
      });
      await refresh();
      setSaved(true);
      window.setTimeout(onClose, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col animate-modal-rise-in max-h-[90vh] overflow-y-auto themed-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border sticky top-0 bg-surface-card z-10">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
            type="button"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">הגדרות פרטיות</h2>
          <div className="w-7" />
        </header>

        <div className="px-5 py-4 space-y-5">
          <Section
            icon={<BookOpen size={18} />}
            title="חזון"
            description="הכתיבה האישית שלך במסך החזון."
            value={vision}
            onChange={setVision}
          />

          <Section
            icon={<Target size={18} />}
            title="הרגלים"
            description="ההרגלים שאתה עוקב אחריהם והתקדמותך."
            value={habits}
            onChange={setHabits}
          />

          {error && (
            <p className="text-xs text-red-400 light:text-red-700 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || saved}
            className="w-full bg-forest-700 disabled:bg-forest-700/30 disabled:text-ink-500 text-on-accent font-medium rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {saved ? (
              <>
                <Check size={16} /> נשמר
              </>
            ) : (
              <>{saving ? 'שומר…' : 'שמור הגדרות'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-forest-500">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          <p className="text-[11px] text-ink-300">{description}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-colors border ${
              value === opt.value
                ? 'bg-forest-700/15 border-forest-500 text-ink-100'
                : 'bg-surface-raised border-surface-border text-ink-300 hover:text-ink-100'
            }`}
          >
            <span className={value === opt.value ? 'text-forest-500' : 'text-ink-300'}>
              {opt.icon}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[10px] text-ink-500">{opt.hint}</div>
            </div>
            {value === opt.value && (
              <Check size={16} className="text-forest-500 shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
