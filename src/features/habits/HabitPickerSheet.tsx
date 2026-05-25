import { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { CreateHabitInput } from './mutations';
import {
  HabitIcon,
  HABIT_ICONS,
  POSITIVE_HABIT_ICONS,
  NEGATIVE_HABIT_ICONS,
  POSITIVE_HABIT_EMOJIS,
  NEGATIVE_HABIT_EMOJIS,
} from './HabitIcon';
import {
  HABIT_COLORS,
  type FrequencyPeriod,
  type Habit,
  type HabitType,
  type SlotIndex,
} from './types';

type Props = {
  open: boolean;
  /**
   * Target slot when creating a new habit. Ignored when editing.
   */
  slotIndex: SlotIndex | null;
  /**
   * When non-null the sheet opens in EDIT mode, pre-filled with this habit's
   * current values. Saving calls onSubmit with the same CreateHabitInput
   * shape — the parent decides whether to create or update.
   */
  editingHabit?: Habit | null;
  onClose: () => void;
  /**
   * Persist the new habit (create or update — decided by parent based on
   * whether editingHabit was provided).
   */
  onSubmit: (input: CreateHabitInput) => Promise<void>;
};

// Default selections for a brand-new habit form.
const DEFAULTS = {
  type: 'positive' as HabitType,
  icon: HABIT_ICONS[0],
  name: '',
  description: '',
  color: HABIT_COLORS[4].hex, // green
  frequency_period: 'daily' as FrequencyPeriod,
  frequency_target: 1,
  is_quantitative: false,
  quantitative_target: 10,
  quantitative_unit: '',
};

export function HabitPickerSheet({
  open,
  slotIndex,
  editingHabit = null,
  onClose,
  onSubmit,
}: Props) {
  const isEditing = !!editingHabit;
  // Form state
  const [type, setType] = useState<HabitType>(DEFAULTS.type);
  const [icon, setIcon] = useState<string>(DEFAULTS.icon);
  const [iconMode, setIconMode] = useState<'icons' | 'emojis'>('icons');
  const [name, setName] = useState<string>(DEFAULTS.name);
  const [description, setDescription] = useState<string>(DEFAULTS.description);
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [frequencyPeriod, setFrequencyPeriod] = useState<FrequencyPeriod>(
    DEFAULTS.frequency_period,
  );
  const [frequencyTarget, setFrequencyTarget] = useState<number>(
    DEFAULTS.frequency_target,
  );
  const [isQuantitative, setIsQuantitative] = useState<boolean>(
    DEFAULTS.is_quantitative,
  );
  const [quantitativeTarget, setQuantitativeTarget] = useState<number>(
    DEFAULTS.quantitative_target,
  );
  const [quantitativeUnit, setQuantitativeUnit] = useState<string>(
    DEFAULTS.quantitative_unit,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / seed form whenever the sheet opens. When editingHabit is provided
  // pre-fill from its values; otherwise fall back to defaults.
  useEffect(() => {
    if (!open) return;
    if (editingHabit) {
      setType(editingHabit.type);
      setIcon(editingHabit.icon);
      setIconMode(HABIT_ICONS.includes(editingHabit.icon) ? 'icons' : 'emojis');
      setName(editingHabit.name);
      setDescription(editingHabit.description ?? '');
      setColor(editingHabit.color);
      // Show advanced when any non-default value is set.
      setShowAdvanced(
        editingHabit.frequency_period !== 'daily' ||
          editingHabit.frequency_target !== 1 ||
          editingHabit.is_quantitative,
      );
      setFrequencyPeriod(editingHabit.frequency_period);
      setFrequencyTarget(editingHabit.frequency_target);
      setIsQuantitative(editingHabit.is_quantitative);
      setQuantitativeTarget(editingHabit.quantitative_target ?? DEFAULTS.quantitative_target);
      setQuantitativeUnit(editingHabit.quantitative_unit ?? '');
    } else {
      setType(DEFAULTS.type);
      setIcon(DEFAULTS.icon);
      setIconMode('icons');
      setName(DEFAULTS.name);
      setDescription(DEFAULTS.description);
      setColor(DEFAULTS.color);
      setShowAdvanced(false);
      setFrequencyPeriod(DEFAULTS.frequency_period);
      setFrequencyTarget(DEFAULTS.frequency_target);
      setIsQuantitative(DEFAULTS.is_quantitative);
      setQuantitativeTarget(DEFAULTS.quantitative_target);
      setQuantitativeUnit(DEFAULTS.quantitative_unit);
    }
    setSubmitting(false);
    setError(null);
  }, [open, slotIndex, editingHabit]);

  // The sheet is allowed to render in edit mode even when slotIndex is null.
  if (!open || (!isEditing && slotIndex === null)) return null;

  // Icon/emoji lists filtered by habit type. When switching type or mode,
  // we also fix up the selected icon if it's no longer valid.
  const iconList = type === 'positive' ? POSITIVE_HABIT_ICONS : NEGATIVE_HABIT_ICONS;
  const emojiList = type === 'positive' ? POSITIVE_HABIT_EMOJIS : NEGATIVE_HABIT_EMOJIS;
  const currentIconList = iconMode === 'icons' ? iconList : emojiList;

  const handleTypeChange = (next: HabitType) => {
    setType(next);
    // If current icon is no longer valid for the new type, switch to a sensible
    // default in the same icon-mode.
    const nextIcons = next === 'positive' ? POSITIVE_HABIT_ICONS : NEGATIVE_HABIT_ICONS;
    const nextEmojis = next === 'positive' ? POSITIVE_HABIT_EMOJIS : NEGATIVE_HABIT_EMOJIS;
    const nextList = iconMode === 'icons' ? nextIcons : nextEmojis;
    if (!nextList.includes(icon)) setIcon(nextList[0]);
  };

  const handleIconModeChange = (mode: 'icons' | 'emojis') => {
    setIconMode(mode);
    const nextList = mode === 'icons' ? iconList : emojiList;
    if (!nextList.includes(icon)) setIcon(nextList[0]);
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const input: CreateHabitInput = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      type,
      color,
      frequency_period: frequencyPeriod,
      frequency_target: frequencyTarget,
      is_quantitative: isQuantitative,
      quantitative_target: isQuantitative ? quantitativeTarget : null,
      quantitative_unit: isQuantitative ? quantitativeUnit.trim() || null : null,
    };
    try {
      await onSubmit(input);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה בשמירה';
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">
            {isEditing ? 'עריכת הרגל' : 'הוספת הרגל חדש'}
          </h2>
          <div className="w-7" /> {/* spacer for symmetric header */}
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto themed-scroll">
          <div className="px-5 py-4 space-y-5">
            {/* Step 1 — type (positive / negative) */}
            <section>
              <SectionTitle>בחר סוג הרגל</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <TypeCard
                  selected={type === 'positive'}
                  accentClass="border-forest-500 bg-forest-700/20 text-forest-400"
                  onClick={() => handleTypeChange('positive')}
                  icon={<BadgeEmoji emoji="✅" />}
                  title="הרגל חיובי"
                  subtitle="הרגל חיובי שאתה רוצה לבנות"
                />
                <TypeCard
                  selected={type === 'negative'}
                  accentClass="border-red-500/70 bg-red-950/30 text-red-400"
                  onClick={() => handleTypeChange('negative')}
                  icon={<BadgeEmoji emoji="❌" />}
                  title="שבירת התמכרות שלילית"
                  subtitle="הרגל שלילי שאתה רוצה להשמיד"
                />
              </div>
            </section>

            {/* Step 2 — icon or emoji. List is filtered by type so only
                relevant glyphs show up. */}
            <section>
              <SectionTitle>בחר סמל להרגל</SectionTitle>
              <div className="flex justify-center my-2">
                <div className="flex gap-1 bg-surface-raised rounded-full p-0.5">
                  <button
                    type="button"
                    onClick={() => handleIconModeChange('icons')}
                    className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
                      iconMode === 'icons'
                        ? 'bg-forest-700 text-cream-50'
                        : 'text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    אייקונים
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIconModeChange('emojis')}
                    className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
                      iconMode === 'emojis'
                        ? 'bg-forest-700 text-cream-50'
                        : 'text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    אימוג'ים
                  </button>
                </div>
              </div>
              <IconGrid
                items={currentIconList}
                value={icon}
                onChange={setIcon}
                accentColor={color}
              />
            </section>

            {/* Step 3 — name + description */}
            <section>
              <SectionTitle>שם</SectionTitle>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === 'positive'
                    ? 'למשל: ריצה בבוקר'
                    : 'למשל: גלילה ברשתות'
                }
                maxLength={60}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-surface-border text-ink-100 placeholder-ink-500 text-sm focus:outline-none focus:border-forest-500"
              />
            </section>

            <section>
              <SectionTitle>תיאור קצר</SectionTitle>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="למה זה חשוב לך?"
                maxLength={120}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-surface-border text-ink-100 placeholder-ink-500 text-sm focus:outline-none focus:border-forest-500"
              />
            </section>

            {/* Step 4 — color */}
            <section>
              <SectionTitle>צבע</SectionTitle>
              <div className="grid grid-cols-7 gap-2">
                {HABIT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    title={c.name}
                    className={`aspect-square rounded-xl transition-transform ${
                      color === c.hex
                        ? 'ring-2 ring-ink-100 ring-offset-2 ring-offset-surface-card scale-95'
                        : ''
                    }`}
                    style={{ backgroundColor: c.hex }}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </section>

            {/* Advanced options */}
            <section>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center justify-between w-full py-2 text-sm text-ink-300 hover:text-ink-100"
              >
                <span>אופציות מתקדמות</span>
                {showAdvanced ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4 pt-3 border-t border-surface-border">
                  {/* Frequency period */}
                  <div>
                    <SectionTitle>תקופת היעד</SectionTitle>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { v: 'daily' as const, label: 'יומי' },
                          { v: 'weekly' as const, label: 'שבועי' },
                          { v: 'monthly' as const, label: 'חודשי' },
                        ]
                      ).map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setFrequencyPeriod(opt.v)}
                          className={`py-2 rounded-xl text-sm transition-colors ${
                            frequencyPeriod === opt.v
                              ? 'bg-forest-700 text-cream-50'
                              : 'bg-surface-raised text-ink-300 hover:text-ink-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Frequency target */}
                  <div>
                    <SectionTitle>
                      כמה פעמים{' '}
                      {frequencyPeriod === 'daily'
                        ? 'ביום'
                        : frequencyPeriod === 'weekly'
                        ? 'בשבוע'
                        : 'בחודש'}
                      ?
                    </SectionTitle>
                    <NumberStepper
                      value={frequencyTarget}
                      onChange={setFrequencyTarget}
                      min={1}
                      max={frequencyPeriod === 'daily' ? 24 : frequencyPeriod === 'weekly' ? 7 : 31}
                    />
                  </div>

                  {/* Quantitative toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsQuantitative((v) => !v)}
                      className="flex items-center justify-between w-full py-2 group"
                    >
                      <div className="text-right">
                        <div className="text-sm text-ink-100">
                          ספירה כמותית
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">
                          לציין כמות (עמודים, דקות וכו') במקום רק בוצע/לא
                        </div>
                      </div>
                      <Toggle on={isQuantitative} />
                    </button>

                    {isQuantitative && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <SectionTitle>יעד לפעם</SectionTitle>
                          <NumberStepper
                            value={quantitativeTarget}
                            onChange={setQuantitativeTarget}
                            min={1}
                            max={9999}
                            step={1}
                          />
                        </div>
                        <div>
                          <SectionTitle>יחידה</SectionTitle>
                          <input
                            value={quantitativeUnit}
                            onChange={(e) => setQuantitativeUnit(e.target.value)}
                            placeholder="עמודים, דקות, ק״מ..."
                            maxLength={20}
                            className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-surface-border text-ink-100 placeholder-ink-500 text-sm focus:outline-none focus:border-forest-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {error && (
              <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-400 text-sm px-3 py-2">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="px-5 py-4 border-t border-surface-border">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-2xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-cream-50"
            style={{
              backgroundColor: canSubmit ? color : 'var(--color-surface-raised)',
            }}
          >
            {submitting ? 'שומר...' : isEditing ? 'שמור שינויים' : 'שמור הרגל'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">
      {children}
    </h3>
  );
}

function TypeCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  accentClass,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accentClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-right rounded-2xl border-2 px-3 py-3 transition-colors ${
        selected
          ? accentClass
          : 'border-surface-border bg-surface-raised text-ink-300 hover:text-ink-100'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="text-[11px] opacity-75">{subtitle}</div>
    </button>
  );
}

// Small white square containing an emoji. Used in the type cards so the
// ✅/❌ glyphs read as clear "do this / don't do this" badges regardless of
// what background the system emoji font provides.
function BadgeEmoji({ emoji }: { emoji: string }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-white text-base leading-none">
      {emoji}
    </span>
  );
}

function IconGrid({
  items,
  value,
  onChange,
  accentColor,
}: {
  items: readonly string[];
  value: string;
  onChange: (name: string) => void;
  accentColor: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-2 max-h-[140px] overflow-y-auto themed-scroll p-1">
      {items.map((name) => {
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={`aspect-square rounded-xl flex items-center justify-center transition-colors ${
              selected
                ? 'text-cream-50'
                : 'bg-surface-raised text-ink-300 hover:text-ink-100'
            }`}
            style={selected ? { backgroundColor: accentColor } : undefined}
            aria-label={name}
          >
            <HabitIcon name={name} size={28} strokeWidth={1.7} />
          </button>
        );
      })}
    </div>
  );
}

function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="w-9 h-9 rounded-xl bg-surface-raised text-ink-100 hover:bg-surface-border disabled:opacity-30 text-lg"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        min={min}
        max={max}
        className="flex-1 text-center px-3 py-2 rounded-xl bg-surface-raised border border-surface-border text-ink-100 text-sm focus:outline-none focus:border-forest-500"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="w-9 h-9 rounded-xl bg-surface-raised text-ink-100 hover:bg-surface-border disabled:opacity-30 text-lg"
      >
        +
      </button>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors ${
        on ? 'bg-forest-700' : 'bg-surface-border'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-cream-50 transition-all ${
          on ? 'right-0.5' : 'left-0.5'
        }`}
      />
    </span>
  );
}
