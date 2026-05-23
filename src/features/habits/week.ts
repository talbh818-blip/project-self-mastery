// Week math — Hebrew week starts on Sunday.
// All dates are handled as "YYYY-MM-DD" strings (calendar-local, no timezone drift).

export type WeekRange = {
  start: Date; // Sunday 00:00 local
  end: Date;   // Saturday 00:00 local
  days: Date[]; // 7 entries, Sunday..Saturday
};

const HEBREW_DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;
const HEBREW_DAY_NAMES_LONG = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay()); // back to Sunday
  return out;
}

export function getWeekRange(anchor: Date): WeekRange {
  const start = startOfWeek(anchor);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  const end = days[6];
  return { start, end, days };
}

export function addWeeks(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n * 7);
  return out;
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isFuture(d: Date, today: Date): boolean {
  return toDateString(d) > toDateString(today);
}

export function hebrewDayShort(d: Date): string {
  return HEBREW_DAY_NAMES[d.getDay()];
}

export function hebrewDayLong(d: Date): string {
  return HEBREW_DAY_NAMES_LONG[d.getDay()];
}

const HEB_MONTHS = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
];

export function formatRangeShort(range: WeekRange): string {
  const a = range.start;
  const b = range.end;
  const dayA = a.getDate();
  const dayB = b.getDate();
  const monA = HEB_MONTHS[a.getMonth()];
  const monB = HEB_MONTHS[b.getMonth()];
  if (a.getMonth() === b.getMonth()) {
    return `${dayA}–${dayB} ${monB}`;
  }
  return `${dayA} ${monA} – ${dayB} ${monB}`;
}

// "השבוע", "השבוע שעבר", "לפני X שבועות", "בעוד שבוע" etc.
export function relativeWeekLabel(anchor: Date, today: Date): string {
  const a = startOfWeek(anchor);
  const t = startOfWeek(today);
  const diffDays = Math.round((a.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks === 0) return 'השבוע';
  if (diffWeeks === -1) return 'השבוע שעבר';
  if (diffWeeks === 1) return 'השבוע הבא';
  if (diffWeeks < 0) return `לפני ${-diffWeeks} שבועות`;
  return `בעוד ${diffWeeks} שבועות`;
}
