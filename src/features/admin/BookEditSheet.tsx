// ============================================================================
// BookEditSheet — admin form to create or edit a course book.
// ----------------------------------------------------------------------------
// Bottom sheet (same chrome as HabitPickerSheet). When `book` is null it opens
// in CREATE mode; otherwise EDIT mode pre-filled from the row. Saving calls
// onSubmit with a BookInput; the parent decides create vs update.
// ============================================================================
import { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { CourseBookWithCount } from '../course/queries';
import type { BookInput } from '../course/mutations';

type Props = {
  open: boolean;
  book: CourseBookWithCount | null; // null → create
  onClose: () => void;
  onSubmit: (input: BookInput) => Promise<void>;
};

export function BookEditSheet({ open, book, onClose, onSubmit }: Props) {
  const isEditing = !!book;
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('100');
  const [isPublished, setIsPublished] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(book?.title ?? '');
    setAuthor(book?.author ?? '');
    setDescription(book?.description ?? '');
    setCoverUrl(book?.cover_url ?? '');
    setSortOrder(String(book?.sort_order ?? 100));
    setIsPublished(book?.is_published ?? true);
    setSubmitting(false);
    setError(null);
  }, [open, book]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const parsedSort = Number(sortOrder);
    const input: BookInput = {
      title: title.trim(),
      author: author.trim() || null,
      cover_url: coverUrl.trim() || null,
      description: description.trim() || null,
      sort_order: Number.isFinite(parsedSort) ? parsedSort : 100,
      is_published: isPublished,
    };
    try {
      await onSubmit(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-surface-border">
          <button onClick={onClose} className="p-1 text-ink-300 hover:text-ink-100" aria-label="סגור">
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-ink-100">
            {isEditing ? 'עריכת ספר' : 'הוספת ספר'}
          </h2>
          <div className="w-7" />
        </header>

        {error && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-xl border border-red-800/60 bg-red-950/40 text-red-300 text-sm px-3 py-2.5 flex items-start gap-2"
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto themed-scroll">
          <div className="px-5 py-4 space-y-4">
            <Field label="שם הספר">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="למשל: הרגלים אטומיים"
                maxLength={120}
                className={inputCls}
              />
            </Field>

            <Field label="מחבר">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="למשל: James Clear"
                maxLength={120}
                className={inputCls}
              />
            </Field>

            <Field label="תיאור (אופציונלי)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תקציר קצר שיופיע מעל רשימת הסרטונים"
                rows={3}
                maxLength={500}
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="כתובת כריכה (URL)">
              <input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="/book-covers/xxx.jpg או https://..."
                dir="ltr"
                className={`${inputCls} text-left`}
              />
              {coverUrl.trim() && (
                <div className="mt-2 flex justify-center">
                  <img
                    src={coverUrl.trim()}
                    alt=""
                    className="h-28 rounded-md object-cover border border-surface-border"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    onLoad={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = '';
                    }}
                  />
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="סדר תצוגה">
                <input
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="100"
                  className={`${inputCls} text-center`}
                />
              </Field>
              <Field label="מצב">
                <button
                  type="button"
                  onClick={() => setIsPublished((v) => !v)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    isPublished
                      ? 'border-forest-500 bg-forest-700/20 text-forest-400'
                      : 'border-surface-border bg-surface-raised text-ink-300'
                  }`}
                >
                  {isPublished ? 'מוצג' : 'מוסתר'}
                </button>
              </Field>
            </div>
            <p className="text-[11px] text-ink-500 -mt-1">
              סדר נמוך יותר = מופיע ראשון בקרוסלה. ספר "מוסתר" לא יוצג למשתמשים.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-surface-border">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-2xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-cream-50 bg-forest-700 hover:bg-forest-800"
          >
            {submitting ? 'שומר...' : isEditing ? 'שמור שינויים' : 'הוסף ספר'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-surface-border text-ink-100 placeholder-ink-500 text-sm focus:outline-none focus:border-forest-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-1.5">{label}</h3>
      {children}
    </div>
  );
}
