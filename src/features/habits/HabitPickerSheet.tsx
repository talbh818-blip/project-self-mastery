import { useEffect, useState } from 'react';
import { X, HelpCircle, ArrowRight } from 'lucide-react';
import { useCatalog } from './useCatalog';
import { assignHabitToSlot, type HabitChoice } from './mutations';
import { HabitIcon, CUSTOM_HABIT_ICONS } from './HabitIcon';
import type { CatalogItem, HabitType, SlotIndex } from './types';

type Props = {
  open: boolean;
  slotIndex: SlotIndex | null;
  userId: string;
  onClose: () => void;
  onAssigned: () => void; // refresh week view
};

type Tab = 'all' | 'positive' | 'negative';

export function HabitPickerSheet({ open, slotIndex, userId, onClose, onAssigned }: Props) {
  const catalog = useCatalog(open);
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'list' | 'custom'>('list');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state whenever the sheet opens for a new slot.
  useEffect(() => {
    if (open) {
      setTab('all');
      setView('list');
      setError(null);
      setSubmitting(false);
    }
  }, [open, slotIndex]);

  if (!open || slotIndex === null) return null;

  const handlePick = async (choice: HabitChoice) => {
    setSubmitting(true);
    setError(null);
    try {
      await assignHabitToSlot({ userId, slotIndex, choice });
      onAssigned();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה בשמירה';
      setError(msg);
      setSubmitting(false);
    }
  };

  const filtered =
    catalog.status === 'ready'
      ? catalog.items.filter((i) => tab === 'all' || i.type === tab)
      : [];

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-forest-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-cream-50 rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-forest-100">
          <h2 className="text-lg font-semibold text-forest-700">
            {view === 'list' ? `סלוט ${slotIndex} — בחר הרגל` : 'הרגל מותאם אישית'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-forest-700/60 hover:text-forest-700"
            aria-label="סגור"
          >
            <X size={20} />
          </button>
        </header>

        {view === 'list' ? (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-3">
              {(
                [
                  { key: 'all', label: 'הכל' },
                  { key: 'positive', label: 'לבנות' },
                  { key: 'negative', label: 'להשמיד' },
                ] as { key: Tab; label: string }[]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    tab === t.key
                      ? 'bg-forest-700 text-cream-50'
                      : 'text-forest-700/70 hover:bg-forest-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {catalog.status === 'loading' && (
                <div className="text-center text-forest-700/50 text-sm py-8">
                  טוען מאגר…
                </div>
              )}
              {catalog.status === 'error' && (
                <div className="text-red-700 text-sm py-3 px-3">
                  שגיאה: {catalog.error}
                </div>
              )}
              {catalog.status === 'ready' && filtered.length === 0 && (
                <div className="text-center text-forest-700/50 text-sm py-8">
                  אין הרגלים בקטגוריה זו
                </div>
              )}
              {catalog.status === 'ready' &&
                filtered.map((item) => (
                  <CatalogRow
                    key={item.id}
                    item={item}
                    disabled={submitting}
                    onClick={() => handlePick({ kind: 'catalog', item })}
                  />
                ))}
            </div>

            {/* "Other" button */}
            <div className="px-5 py-3 border-t border-forest-100">
              <button
                onClick={() => setView('custom')}
                disabled={submitting}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-forest-50 hover:bg-forest-100 text-forest-700 text-sm transition-colors disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <HelpCircle size={18} strokeWidth={1.8} />
                  הרגל אחר (מותאם אישית)
                </span>
                <ArrowRight size={16} className="rotate-180" />
              </button>
            </div>
          </>
        ) : (
          <CustomForm
            submitting={submitting}
            onBack={() => setView('list')}
            onSubmit={(c) => handlePick(c)}
          />
        )}

        {error && (
          <div className="px-5 py-2 bg-red-50 text-red-700 text-xs border-t border-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogRow({
  item,
  onClick,
  disabled,
}: {
  item: CatalogItem;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-forest-50 text-right transition-colors disabled:opacity-50"
    >
      <span className="w-10 h-10 rounded-full bg-forest-50 flex items-center justify-center text-forest-700 shrink-0">
        <HabitIcon name={item.icon} size={20} strokeWidth={1.8} />
      </span>
      <span className="flex-1 text-sm text-forest-700">{item.name}</span>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full ${
          item.type === 'positive'
            ? 'bg-forest-100 text-forest-700'
            : 'bg-red-50 text-red-700'
        }`}
      >
        {item.type === 'positive' ? 'לבנות' : 'להשמיד'}
      </span>
    </button>
  );
}

function CustomForm({
  submitting,
  onBack,
  onSubmit,
}: {
  submitting: boolean;
  onBack: () => void;
  onSubmit: (c: HabitChoice) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(CUSTOM_HABIT_ICONS[0]);
  const [type, setType] = useState<HabitType>('positive');

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <button
        onClick={onBack}
        disabled={submitting}
        className="text-xs text-forest-700/60 hover:text-forest-700 mb-4 flex items-center gap-1"
      >
        <ArrowRight size={14} />
        חזרה למאגר
      </button>

      <label className="block text-sm text-forest-700 mb-1">שם ההרגל</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={submitting}
        placeholder="למשל: ללכת ברגל לעבודה"
        className="w-full px-3 py-2 rounded-xl border border-forest-200 bg-white focus:outline-none focus:border-forest-500 text-sm mb-4"
        maxLength={40}
      />

      <label className="block text-sm text-forest-700 mb-1">סוג</label>
      <div className="flex gap-2 mb-4">
        {(
          [
            { v: 'positive' as const, label: 'לבנות' },
            { v: 'negative' as const, label: 'להשמיד' },
          ]
        ).map((opt) => (
          <button
            key={opt.v}
            onClick={() => setType(opt.v)}
            disabled={submitting}
            className={`flex-1 py-2 rounded-xl text-sm transition-colors ${
              type === opt.v
                ? 'bg-forest-700 text-cream-50'
                : 'bg-forest-50 text-forest-700 hover:bg-forest-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className="block text-sm text-forest-700 mb-2">אייקון</label>
      <div className="grid grid-cols-5 gap-2 mb-5">
        {CUSTOM_HABIT_ICONS.map((name) => (
          <button
            key={name}
            onClick={() => setIcon(name)}
            disabled={submitting}
            className={`aspect-square rounded-xl flex items-center justify-center transition-colors ${
              icon === name
                ? 'bg-forest-700 text-cream-50'
                : 'bg-forest-50 text-forest-700 hover:bg-forest-100'
            }`}
          >
            <HabitIcon name={name} size={18} strokeWidth={1.8} />
          </button>
        ))}
      </div>

      <button
        onClick={() => onSubmit({ kind: 'custom', name: name.trim(), icon, type })}
        disabled={!canSubmit}
        className="w-full py-3 rounded-2xl bg-forest-700 hover:bg-forest-800 text-cream-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'שומר…' : 'הוסף הרגל'}
      </button>
    </div>
  );
}
