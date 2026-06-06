// ============================================================================
// DatePickerSheet — themed 3-wheel date picker (day / month / year).
// ----------------------------------------------------------------------------
// Replaces the browser's native date control (which couldn't be styled
// to match the app and rendered in the OS language). Looks-and-feels like
// the iOS wheel picker: each column is a vertically scrolling list with
// scroll-snap; the centred item is the selected value. A horizontal band
// behind the centre shows the selection window across all three columns.
//
// Day options auto-clamp to the chosen (year, month) so Feb 30 / Apr 31
// can't be selected.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';

type Props = {
  open: boolean;
  /** ISO 'YYYY-MM-DD'. */
  value: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
};

const HEB_MONTHS_FULL = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// Year range — 6 years back, 1 year forward. Vision journaling is meant
// for the near future / recent past; wider ranges would clutter the wheel.
function yearRange(today: Date): number[] {
  const y = today.getFullYear();
  const arr: number[] = [];
  for (let i = y - 6; i <= y + 1; i++) arr.push(i);
  return arr;
}

function daysInMonth(year: number, monthIdx: number): number {
  // Day 0 of next month = last day of this month
  return new Date(year, monthIdx + 1, 0).getDate();
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y || 0, m: (m || 1) - 1, d: d || 1 };
}

function toIso(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export function DatePickerSheet({ open, value, onConfirm, onClose }: Props) {
  const today = useMemo(() => new Date(), []);
  const years = useMemo(() => yearRange(today), [today]);

  const parsed = parseIso(value);
  const [year, setYear] = useState<number>(parsed.y);
  const [month, setMonth] = useState<number>(parsed.m); // 0-indexed
  const [day, setDay] = useState<number>(parsed.d);

  // Re-seed on open / when external value changes.
  useEffect(() => {
    if (!open) return;
    const p = parseIso(value);
    setYear(p.y);
    setMonth(p.m);
    setDay(p.d);
  }, [open, value]);

  // Body-scroll lock while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Clamp day when (year, month) changes. Picking Feb 30 then switching to
  // March should land you on March 30, not silently truncate to the 28th.
  const maxDay = daysInMonth(year, month);
  useEffect(() => {
    if (day > maxDay) setDay(maxDay);
  }, [maxDay, day]);

  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => String(i + 1)),
    [maxDay],
  );
  const monthOptions = HEB_MONTHS_FULL;
  const yearOptions = useMemo(() => years.map((y) => String(y)), [years]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(toIso(year, month, day));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-modal-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="בחר תאריך"
    >
      <div
        dir="rtl"
        className="w-full max-w-md bg-surface-card rounded-3xl shadow-xl flex flex-col animate-modal-rise-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <button
            type="button"
            onClick={onClose}
            aria-label="ביטול"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-ink-300 hover:bg-surface-raised hover:text-ink-100"
          >
            <X size={18} />
          </button>
          <span className="text-sm font-semibold text-ink-100">
            תאריך כתיבה
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            aria-label="אישור"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-on-accent bg-forest-700 hover:bg-forest-600"
          >
            <Check size={18} />
          </button>
        </div>

        {/* Wheels */}
        <div className="relative px-4 py-5">
          {/* Selection band behind the centre — sits below the wheels via
              pointer-events:none so scroll still works through it. */}
          <div
            aria-hidden
            className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-10 rounded-xl bg-forest-700/20 border-y border-forest-700/40 pointer-events-none"
          />
          <div className="relative flex gap-2">
            <WheelColumn
              items={dayOptions}
              value={String(day)}
              onChange={(v) => setDay(Number(v))}
              ariaLabel="יום"
            />
            <WheelColumn
              items={monthOptions}
              value={monthOptions[month]}
              onChange={(v) => setMonth(monthOptions.indexOf(v))}
              ariaLabel="חודש"
            />
            <WheelColumn
              items={yearOptions}
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              ariaLabel="שנה"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WheelColumn ────────────────────────────────────────────────────────────

const ITEM_H = 40;     // px — each row's height. Drives scroll-snap math.
const VISIBLE = 5;     // odd → the centre row is the selected one
const CONTAINER_H = ITEM_H * VISIBLE;
const PAD = (CONTAINER_H - ITEM_H) / 2; // top/bottom padding so first/last items can centre

function WheelColumn({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const currentIndex = Math.max(0, items.indexOf(value));

  // Sync external value → scroll position (e.g., day clamp after month change)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targetTop = currentIndex * ITEM_H;
    if (Math.abs(el.scrollTop - targetTop) > 1) {
      el.scrollTo({ top: targetTop, behavior: 'auto' });
    }
  }, [currentIndex]);

  // Debounce: while the user is mid-scroll we don't want to fire onChange
  // on every pixel. Wait 110 ms after the last scroll event, then snap and
  // emit the new value if it differs.
  const settleTimer = useRef<number | null>(null);
  const handleScroll = () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      const nextValue = items[clamped];
      if (nextValue !== value) onChange(nextValue);
    }, 110);
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      className="flex-1 vision-wheel"
      style={{
        height: CONTAINER_H,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      <div style={{ height: PAD }} aria-hidden />
      {items.map((item) => {
        const selected = item === value;
        return (
          <div
            key={item}
            role="option"
            aria-selected={selected}
            style={{
              height: ITEM_H,
              scrollSnapAlign: 'center',
            }}
            className={`flex items-center justify-center text-base transition-colors ${
              selected
                ? 'text-ink-100 font-semibold'
                : 'text-ink-500'
            }`}
          >
            {item}
          </div>
        );
      })}
      <div style={{ height: PAD }} aria-hidden />
    </div>
  );
}
