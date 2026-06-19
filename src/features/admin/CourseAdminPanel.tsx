// ============================================================================
// CourseAdminPanel — admin management of the course catalog (books + videos).
// ----------------------------------------------------------------------------
// Shown under the "קורס" tab of the admin screen. Lists every book (including
// hidden ones), with actions to edit the book, manage its videos, toggle
// published, and delete. A top button adds a new book.
//
// Book create/edit happens in BookEditSheet; per-book video CRUD in
// VideoManagerSheet. Both call back here to reload so counts stay fresh.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Film, Eye, EyeOff, RefreshCw, BookOpen } from 'lucide-react';
import {
  fetchAllBooksAdmin,
  type CourseBookWithCount,
} from '../course/queries';
import {
  createBook,
  updateBook,
  deleteBook,
  type BookInput,
} from '../course/mutations';
import { BookEditSheet } from './BookEditSheet';
import { VideoManagerSheet } from './VideoManagerSheet';
import { CompassLoader } from '../../components/CompassLoader';

export function CourseAdminPanel() {
  const [books, setBooks] = useState<CourseBookWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sheets: which book is being edited / having videos managed. 'new' = create.
  const [editing, setEditing] = useState<CourseBookWithCount | 'new' | null>(null);
  const [managingVideos, setManagingVideos] = useState<CourseBookWithCount | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBooks(await fetchAllBooksAdmin());
    } catch (e) {
      setError(describeError(e, 'שגיאה בטעינה'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmitBook = async (input: BookInput) => {
    if (editing && editing !== 'new') {
      await updateBook(editing.id, input);
    } else {
      await createBook(input);
    }
    await load();
  };

  const handleTogglePublished = async (b: CourseBookWithCount) => {
    setBusy(true);
    try {
      await updateBook(b.id, { is_published: !b.is_published });
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה בעדכון'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (b: CourseBookWithCount) => {
    if (
      !window.confirm(
        `למחוק את הספר "${b.title}"?\nכל הסרטונים שלו יימחקו גם כן. אי אפשר לבטל.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteBook(b.id);
      await load();
    } catch (e) {
      setError(describeError(e, 'שגיאה במחיקה'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-forest-700 hover:bg-forest-800 text-on-accent"
        >
          <Plus size={16} />
          הוסף ספר
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          רענן
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 light:text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {books === null && !error && (
        <div className="py-8">
          <CompassLoader size="md" />
        </div>
      )}

      {books && books.length === 0 && (
        <div className="rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-10 text-center text-ink-300 text-sm">
          אין ספרים עדיין. לחץ "הוסף ספר" כדי להתחיל.
        </div>
      )}

      {books && books.length > 0 && (
        <ul className="space-y-3">
          {books.map((b) => (
            <BookAdminCard
              key={b.id}
              book={b}
              busy={busy}
              onEdit={() => setEditing(b)}
              onManageVideos={() => setManagingVideos(b)}
              onTogglePublished={() => void handleTogglePublished(b)}
              onDelete={() => void handleDelete(b)}
            />
          ))}
        </ul>
      )}

      <BookEditSheet
        open={editing !== null}
        book={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmitBook}
      />

      <VideoManagerSheet
        open={managingVideos !== null}
        book={managingVideos}
        onClose={() => setManagingVideos(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}

function BookAdminCard({
  book,
  busy,
  onEdit,
  onManageVideos,
  onTogglePublished,
  onDelete,
}: {
  book: CourseBookWithCount;
  busy: boolean;
  onEdit: () => void;
  onManageVideos: () => void;
  onTogglePublished: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`rounded-2xl border bg-surface-card px-3 py-3 ${
        book.is_published ? 'border-surface-border' : 'border-amber-500/40'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Cover thumb */}
        <div className="shrink-0 w-12 h-[72px] rounded-md overflow-hidden bg-surface-raised">
          {book.cover_url ? (
            <img src={book.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-500">
              <BookOpen size={16} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-100 truncate">{book.title}</span>
            {!book.is_published && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/60 text-amber-400">
                מוסתר
              </span>
            )}
          </div>
          {book.author && (
            <div className="text-[12px] text-ink-300 truncate">{book.author}</div>
          )}
          <div className="text-[11px] text-ink-500 mt-1 flex items-center gap-1">
            <Film size={11} />
            {book.videoCount} סרטונים · סדר {book.sort_order}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionBtn onClick={onManageVideos} disabled={busy} icon={<Film size={14} />} label="סרטונים" variant="primary" />
        <ActionBtn onClick={onEdit} disabled={busy} icon={<Pencil size={14} />} label="ערוך" />
        <ActionBtn
          onClick={onTogglePublished}
          disabled={busy}
          icon={book.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
          label={book.is_published ? 'הסתר' : 'הצג'}
          variant="warn"
        />
        <ActionBtn onClick={onDelete} disabled={busy} icon={<Trash2 size={14} />} label="מחק" variant="danger" />
      </div>
    </li>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon,
  label,
  variant = 'default',
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'primary' | 'danger' | 'warn';
}) {
  const styles =
    variant === 'danger'
      ? 'border-red-500/60 text-red-400 hover:bg-red-500/10'
      : variant === 'warn'
        ? 'border-amber-500/60 text-amber-400 hover:bg-amber-500/10'
        : variant === 'primary'
          ? 'border-forest-500/60 text-forest-700 hover:bg-forest-500/10'
          : 'border-surface-border text-ink-100 hover:bg-surface-raised';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}
    >
      {icon}
      {label}
    </button>
  );
}

function describeError(e: unknown, fallback: string): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message : null;
    const code = typeof obj.code === 'string' ? obj.code : null;
    const hint = typeof obj.hint === 'string' ? obj.hint : null;
    const details = typeof obj.details === 'string' ? obj.details : null;
    const parts = [msg, code && `[${code}]`, hint, details].filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  return fallback;
}
