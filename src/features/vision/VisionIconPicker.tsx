// ============================================================================
// VisionIconPicker — bottom sheet for choosing an icon/emoji for a vision
// entry. Reuses the habit picker's icon + emoji catalogues and the shared
// <HabitIcon /> renderer so the visual set is identical across the app.
//
// A selected value is EITHER a Lucide icon name OR a raw emoji char; the
// caller persists it onto the vision entry. Selecting closes the sheet
// immediately; the trash chip clears the icon.
// ============================================================================
import { useMemo, useState } from 'react';
import { X, Trash2, Search } from 'lucide-react';
import {
  HabitIcon,
  HABIT_EMOJIS,
  HABIT_ICONS,
} from '../habits/HabitIcon';
import { EMOJI_TO_FLUENT_NAME } from '../../components/fluent-emoji-map';

type Props = {
  open: boolean;
  /** Current icon (Lucide name or emoji char), or null. */
  value: string | null;
  /** Pick a new icon, or null to clear it. */
  onPick: (icon: string | null) => void;
  onClose: () => void;
};

type Tab = 'emoji' | 'icon';

export function VisionIconPicker({ open, value, onPick, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('emoji');
  const [query, setQuery] = useState('');

  // Filter by name. Lucide icons match on their (English) icon name; emojis
  // match on their Fluent descriptive name (e.g. "Soccer ball", "Person
  // running"), or on the emoji char itself.
  const filtered = useMemo(() => {
    const base = tab === 'emoji' ? HABIT_EMOJIS : HABIT_ICONS;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => {
      if (tab === 'icon') return item.toLowerCase().includes(q);
      const name = EMOJI_TO_FLUENT_NAME[item];
      return (name ? name.toLowerCase().includes(q) : false) || item === query.trim();
    });
  }, [tab, query]);

  if (!open) return null;

  const choose = (v: string) => {
    onPick(v);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="בחר אייקון לחזון"
    >
      <div
        dir="rtl"
        className="w-full max-w-[300px] bg-surface-card rounded-2xl shadow-xl flex flex-col animate-modal-rise-in overflow-hidden max-h-[58vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-300 hover:bg-surface-raised hover:text-ink-100"
          >
            <X size={16} />
          </button>
          <span className="text-[13px] font-semibold text-ink-100">
            אייקון לחזון
          </span>
          {/* Clear — only meaningful when an icon is already set. */}
          <button
            type="button"
            onClick={() => {
              onPick(null);
              onClose();
            }}
            disabled={!value}
            aria-label="הסר אייקון"
            title="הסר אייקון"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-300 hover:bg-surface-raised hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-300"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-3 pt-2">
          {(
            [
              ['emoji', 'אימוג׳י'],
              ['icon', 'אייקונים'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 h-7 rounded-lg text-[11px] font-semibold transition-colors ${
                tab === key
                  ? 'bg-forest-700/20 text-forest-500 ring-1 ring-forest-700'
                  : 'bg-surface-raised text-ink-300 hover:text-ink-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search — matches the English name of the icon / emoji. */}
        <div className="px-3 pt-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם (באנגלית)…"
              className="w-full h-8 pr-8 pl-2.5 rounded-lg bg-surface-raised text-ink-100 text-[12px] placeholder:text-ink-300 ring-1 ring-surface-border focus:ring-forest-700 outline-none"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto themed-scroll px-3 py-2 mt-1">
          {filtered.length === 0 ? (
            <p className="text-center text-[12px] text-ink-300 py-6">
              לא נמצאו תוצאות
            </p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {filtered.map((item) => {
                const selected = item === value;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => choose(item)}
                    aria-label={item}
                    className={`aspect-square rounded-lg flex items-center justify-center transition-colors ${
                      selected
                        ? 'bg-forest-700/25 ring-1 ring-forest-700 text-forest-500'
                        : 'bg-surface-raised hover:bg-surface-raised/70 text-ink-100'
                    }`}
                  >
                    <HabitIcon name={item} size={20} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
