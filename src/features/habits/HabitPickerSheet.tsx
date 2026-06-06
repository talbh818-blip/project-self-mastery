import { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle, AlignLeft, List, ListOrdered, ListChecks, type LucideIcon } from 'lucide-react';
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
  type DescriptionFormat,
  type Difficulty,
  type FrequencyPeriod,
  type Habit,
  type HabitType,
  type SlotIndex,
} from './types';
import {
  SKIN_TONES,
  type SkinToneKey,
  isTonableEmoji,
  applySkinTone,
  stripSkinTone,
  skinToneOf,
} from '../../components/fluent-emoji-map';

const SKIN_TONE_STORAGE_KEY = 'habit-emoji-skin-tone';

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
  description_format: 'text' as DescriptionFormat,
  color: HABIT_COLORS[5].hex, // ירוק (index 5 in the 21-swatch palette)
  difficulty: 'medium' as Difficulty,
  frequency_period: 'daily' as FrequencyPeriod,
  frequency_target: 1,
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
  // Global skin tone for the (tonable) person emojis. Remembered across
  // sessions so the user's preference sticks.
  const [skinTone, setSkinTone] = useState<SkinToneKey>(() => {
    try {
      return (localStorage.getItem(SKIN_TONE_STORAGE_KEY) as SkinToneKey) || 'default';
    } catch {
      return 'default';
    }
  });
  const [name, setName] = useState<string>(DEFAULTS.name);
  const [description, setDescription] = useState<string>(DEFAULTS.description);
  const [descriptionFormat, setDescriptionFormat] = useState<DescriptionFormat>(
    DEFAULTS.description_format,
  );
  const [color, setColor] = useState<string>(DEFAULTS.color);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULTS.difficulty);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [frequencyPeriod, setFrequencyPeriod] = useState<FrequencyPeriod>(
    DEFAULTS.frequency_period,
  );
  const [frequencyTarget, setFrequencyTarget] = useState<number>(
    DEFAULTS.frequency_target,
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
      // If the saved icon is a toned emoji, reflect its tone in the selector.
      if (isTonableEmoji(editingHabit.icon)) {
        setSkinTone(skinToneOf(editingHabit.icon));
      }
      setName(editingHabit.name);
      setDescription(editingHabit.description ?? '');
      setDescriptionFormat(editingHabit.description_format ?? 'text');
      setColor(editingHabit.color);
      setDifficulty(editingHabit.difficulty ?? DEFAULTS.difficulty);
      // Show advanced when any non-default value is set.
      setShowAdvanced(
        editingHabit.frequency_period !== 'daily' ||
          editingHabit.frequency_target !== 1 ||
          editingHabit.is_quantitative,
      );
      // Legacy quantitative habits map onto the unified model: a daily target
      // equal to the old per-day count. The per-cell counter is now driven
      // purely by "daily target > 1".
      if (editingHabit.is_quantitative) {
        setFrequencyPeriod('daily');
        setFrequencyTarget(
          editingHabit.quantitative_target ??
            Math.max(2, editingHabit.frequency_target),
        );
      } else {
        setFrequencyPeriod(editingHabit.frequency_period);
        setFrequencyTarget(editingHabit.frequency_target);
      }
    } else {
      setType(DEFAULTS.type);
      setIcon(DEFAULTS.icon);
      setIconMode('icons');
      setName(DEFAULTS.name);
      setDescription(DEFAULTS.description);
      setDescriptionFormat(DEFAULTS.description_format);
      setColor(DEFAULTS.color);
      setDifficulty(DEFAULTS.difficulty);
      setShowAdvanced(false);
      setFrequencyPeriod(DEFAULTS.frequency_period);
      setFrequencyTarget(DEFAULTS.frequency_target);
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
    // default in the same icon-mode. Compare against the tone-stripped base so
    // a toned emoji still counts as "in the list".
    const nextIcons = next === 'positive' ? POSITIVE_HABIT_ICONS : NEGATIVE_HABIT_ICONS;
    const nextEmojis = next === 'positive' ? POSITIVE_HABIT_EMOJIS : NEGATIVE_HABIT_EMOJIS;
    const nextList = iconMode === 'icons' ? nextIcons : nextEmojis;
    if (!nextList.includes(stripSkinTone(icon))) setIcon(nextList[0]);
  };

  const handleIconModeChange = (mode: 'icons' | 'emojis') => {
    setIconMode(mode);
    const nextList = mode === 'icons' ? iconList : emojiList;
    if (!nextList.includes(stripSkinTone(icon))) setIcon(nextList[0]);
  };

  const handleSkinToneChange = (tone: SkinToneKey) => {
    setSkinTone(tone);
    try {
      localStorage.setItem(SKIN_TONE_STORAGE_KEY, tone);
    } catch {
      /* ignore storage failures */
    }
    // Keep the currently-selected tonable emoji in sync with the new tone.
    if (isTonableEmoji(icon)) setIcon(applySkinTone(icon, tone));
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    // For list formats, drop blank/whitespace-only items so we don't persist
    // empty rows; plain text just gets trimmed at the ends.
    const cleanedDescription =
      descriptionFormat === 'text'
        ? description.trim()
        : description
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .join('\n');
    // The per-cell click counter (formerly the separate "ספירה כמותית"
    // toggle) is now driven purely by a daily target greater than 1: each
    // tap counts 1→target, and the day only "completes" at the target.
    const isCounting = frequencyPeriod === 'daily' && frequencyTarget > 1;
    const input: CreateHabitInput = {
      name: name.trim(),
      description: cleanedDescription || null,
      description_format: descriptionFormat,
      icon,
      type,
      color,
      difficulty,
      frequency_period: frequencyPeriod,
      frequency_target: frequencyTarget,
      is_quantitative: isCounting,
      quantitative_target: isCounting ? frequencyTarget : null,
      quantitative_unit: null,
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

        {/* Error banner — sits between the header and the scrollable body so
            it's always visible no matter where the user is scrolled. Dismiss
            with the X. */}
        {error && (
          <div
            role="alert"
            className="mx-5 mt-3 mb-1 rounded-xl border border-red-800/60 bg-red-950/40 text-red-300 text-sm px-3 py-2.5 flex items-start gap-2"
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 -m-1 p-1 text-red-300/70 hover:text-red-300"
              aria-label="סגור הודעה"
            >
              <X size={14} />
            </button>
          </div>
        )}

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
                  Icon={CheckCircle2}
                  title="הרגל חיובי"
                />
                <TypeCard
                  selected={type === 'negative'}
                  accentClass="border-red-500/70 bg-red-950/30 text-red-400"
                  onClick={() => handleTypeChange('negative')}
                  Icon={XCircle}
                  title="התמכרות שלילית"
                />
              </div>
            </section>

            {/* Step 2 — icon or emoji. Toggle sits on the same row as the
                section title. List is filtered by habit type so only
                relevant glyphs show up. */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>בחר סמל להרגל</SectionTitle>
                <div className="flex gap-1 bg-surface-raised rounded-full p-0.5">
                  <button
                    type="button"
                    onClick={() => handleIconModeChange('icons')}
                    className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
                      iconMode === 'icons'
                        ? 'bg-forest-700 text-on-accent'
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
                        ? 'bg-forest-700 text-on-accent'
                        : 'text-ink-300 hover:text-ink-100'
                    }`}
                  >
                    אימוג'ים
                  </button>
                </div>
              </div>
              {/* Skin-tone selector — only in emoji mode. Sets the tone for
                  all the person emojis at once; picking one then stores that
                  toned variant. */}
              {iconMode === 'emojis' && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-ink-500 shrink-0">גוון עור:</span>
                  <div className="flex items-center gap-1.5">
                    {SKIN_TONES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => handleSkinToneChange(t.key)}
                        title={t.label}
                        aria-label={t.label}
                        aria-pressed={skinTone === t.key}
                        className={`w-5 h-5 rounded-full transition-transform ${
                          skinTone === t.key
                            ? 'ring-2 ring-ink-100 ring-offset-2 ring-offset-surface-card scale-95'
                            : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: t.swatch }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <IconGrid
                items={currentIconList}
                value={icon}
                onChange={setIcon}
                accentColor={color}
                skinTone={skinTone}
              />
            </section>

            {/* Step 3 — name */}
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

            {/* Step 3.5 — description, with a format the user picks (plain
                sentence / bullets / numbers / checklist). Kept compact: the
                format toggle shares the title row, and the textarea is short. */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>תיאור (לא חובה)</SectionTitle>
                <div className="flex gap-0.5 bg-surface-raised rounded-full p-0.5">
                  {(
                    [
                      ['text', AlignLeft, 'משפט'],
                      ['bullets', List, 'בולטים'],
                      ['numbers', ListOrdered, 'מספרים'],
                      ['checklist', ListChecks, "צ׳קליסט"],
                    ] as const
                  ).map(([fmt, Icon, label]) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setDescriptionFormat(fmt)}
                      aria-label={label}
                      aria-pressed={descriptionFormat === fmt}
                      title={label}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                        descriptionFormat === fmt
                          ? 'bg-forest-700 text-on-accent'
                          : 'text-ink-300 hover:text-ink-100'
                      }`}
                    >
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
              {descriptionFormat === 'text' ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="משפט קצר שמתאר את ההרגל…"
                  className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-surface-border text-ink-100 placeholder-ink-500 text-sm focus:outline-none focus:border-forest-500 resize-none leading-relaxed"
                />
              ) : (
                <ListEditor
                  format={descriptionFormat}
                  value={description}
                  onChange={setDescription}
                />
              )}
            </section>

            {/* Step 4 — difficulty. Question phrasing depends on type. */}
            <section>
              <SectionTitle>
                {type === 'positive'
                  ? 'בכנות, כמה ההרגל הזה קשה לך?'
                  : 'בכנות, כמה ההתמכרות הזאת קשה לך?'}
              </SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <DifficultyButton
                  level="easy"
                  selected={difficulty === 'easy'}
                  onClick={() => setDifficulty('easy')}
                >
                  קל
                </DifficultyButton>
                <DifficultyButton
                  level="medium"
                  selected={difficulty === 'medium'}
                  onClick={() => setDifficulty('medium')}
                >
                  בינוני
                </DifficultyButton>
                <DifficultyButton
                  level="hard"
                  selected={difficulty === 'hard'}
                  onClick={() => setDifficulty('hard')}
                >
                  קשה
                </DifficultyButton>
              </div>
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
                <span>אופציות נוספות</span>
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
                              ? 'bg-forest-700 text-on-accent'
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
                    {/* When the daily target is >1, the cell becomes a tap
                        counter (1→target) and only "completes" at the target. */}
                    {frequencyPeriod === 'daily' && frequencyTarget > 1 && (
                      <p className="text-xs text-ink-500 mt-2 leading-snug">
                        כל לחיצה על המשבצת תספור 1 עד {frequencyTarget} — ההרגל
                        נחשב כבוצע ביום רק כשמגיעים ל-{frequencyTarget}.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

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

// Inline list editor. A single <textarea> holds one item per line (so the
// user can select & delete across multiple lines natively), while a gutter
// overlay renders each line's prefix (•, 1., ☐) right beside the text — the
// bullets live *inside* the writing area. Capped at MAX_LIST_ITEMS lines.
const MAX_LIST_ITEMS = 10;
const LIST_LINE_HEIGHT = '1.6rem';

function ListEditor({
  format,
  value,
  onChange,
}: {
  format: Exclude<DescriptionFormat, 'text'>;
  value: string;
  onChange: (next: string) => void;
}) {
  const lines = value.length ? value.split('\n') : [''];
  const lineCount = lines.length;

  const prefixFor = (i: number) =>
    format === 'bullets' ? '•' : format === 'numbers' ? `${i + 1}.` : '☐';

  const handleChange = (raw: string) => {
    // Enforce the 10-line cap: extra lines (e.g. from Enter or a paste) are
    // dropped, which effectively blocks adding an 11th item.
    const ls = raw.split('\n');
    onChange(ls.length > MAX_LIST_ITEMS ? ls.slice(0, MAX_LIST_ITEMS).join('\n') : raw);
  };

  // rows always >= line count (capped at 10), so the textarea never scrolls
  // internally and the absolutely-positioned gutter stays aligned.
  const rows = Math.min(MAX_LIST_ITEMS, Math.max(2, lineCount));

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        dir="rtl"
        wrap="off"
        rows={rows}
        placeholder="פריט…"
        className="w-full rounded-xl bg-surface-raised border border-surface-border text-ink-100 placeholder-ink-500 text-sm focus:outline-none focus:border-forest-500 resize-none block"
        style={{
          lineHeight: LIST_LINE_HEIGHT,
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          paddingLeft: '0.75rem',
          paddingRight: '1.9rem', // reserve the right gutter (RTL start side)
        }}
      />
      {/* Prefix gutter — pinned to the right (line start in RTL), one prefix
          per logical line, sharing the textarea's line-height + top padding. */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 pointer-events-none text-ink-300 text-sm tabular-nums select-none text-center"
        style={{
          paddingTop: '0.5rem',
          width: '1.9rem',
          lineHeight: LIST_LINE_HEIGHT,
        }}
      >
        {lines.map((_, i) => (
          <div key={i} style={{ height: LIST_LINE_HEIGHT }}>
            {prefixFor(i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeCard({
  selected,
  onClick,
  Icon,
  title,
  accentClass,
}: {
  selected: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  title: string;
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
      <div className="flex items-center gap-2">
        <Icon size={18} strokeWidth={2} />
        <span className="text-sm font-medium">{title}</span>
      </div>
    </button>
  );
}

// Three-state difficulty selector — green/yellow/red pill that highlights
// when selected.
function DifficultyButton({
  level,
  selected,
  onClick,
  children,
}: {
  level: 'easy' | 'medium' | 'hard';
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const selectedClass =
    level === 'easy'
      ? 'border-forest-500 bg-forest-700/25 text-forest-400'
      : level === 'medium'
      ? 'border-yellow-500 bg-yellow-500/15 text-yellow-300'
      : 'border-red-500/70 bg-red-950/35 text-red-400';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
        selected
          ? selectedClass
          : 'border-surface-border bg-surface-raised text-ink-300 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  );
}

function IconGrid({
  items,
  value,
  onChange,
  accentColor,
  skinTone,
}: {
  items: readonly string[];
  value: string;
  onChange: (name: string) => void;
  accentColor: string;
  skinTone: SkinToneKey;
}) {
  return (
    <div className="grid grid-cols-7 gap-2 max-h-[140px] overflow-y-auto themed-scroll p-1">
      {items.map((name) => {
        // Tonable person emojis render — and are stored — in the chosen tone.
        const display = isTonableEmoji(name) ? applySkinTone(name, skinTone) : name;
        // Compare on the tone-stripped base so a toned value still highlights
        // its base swatch.
        const selected = stripSkinTone(value) === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(display)}
            className={`aspect-square rounded-xl flex items-center justify-center transition-colors ${
              selected
                ? 'text-cream-50'
                : 'bg-surface-raised text-ink-300 hover:text-ink-100'
            }`}
            style={selected ? { backgroundColor: accentColor } : undefined}
            aria-label={name}
          >
            <HabitIcon name={display} size={28} strokeWidth={1.7} />
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
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '');
          if (raw === '') return;
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
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

