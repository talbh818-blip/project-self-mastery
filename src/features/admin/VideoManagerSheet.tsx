// ============================================================================
// VideoManagerSheet — admin CRUD for one book's summary videos.
// ----------------------------------------------------------------------------
// Two modes inside one sheet:
//   • list  — every video for the book, each with edit/delete; "add" button.
//   • form  — add or edit a single video. The source field accepts a full
//             YouTube/Drive URL or a bare id; we parse to a clean source_id
//             and show a live thumbnail + parsed-id confirmation.
//
// The parent only needs to pass the target book and an onChanged callback so
// it can refresh the book list's video counts after edits.
// ============================================================================
import { useEffect, useState } from 'react';
import { X, ChevronRight, Plus, Pencil, Trash2, AlertTriangle, Check } from 'lucide-react';
import {
  fetchVideos,
  videoThumbnail,
  type CourseBookWithCount,
  type CourseVideo,
  type VideoProvider,
} from '../course/queries';
import {
  createVideo,
  updateVideo,
  deleteVideo,
  parseSourceId,
  type VideoInput,
} from '../course/mutations';

type Props = {
  open: boolean;
  book: CourseBookWithCount | null;
  onClose: () => void;
  /** Called after any successful create/update/delete so the parent can refresh. */
  onChanged: () => void;
};

// null → list mode. 'new' → add form. CourseVideo → edit form.
type Mode = null | 'new' | CourseVideo;

export function VideoManagerSheet({ open, book, onClose, onChanged }: Props) {
  const [videos, setVideos] = useState<CourseVideo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);

  const reload = async (bookId: string) => {
    setLoadError(null);
    try {
      setVideos(await fetchVideos(bookId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'שגיאה בטעינה');
    }
  };

  useEffect(() => {
    if (!open || !book) {
      setVideos(null);
      setMode(null);
      return;
    }
    setMode(null);
    void reload(book.id);
  }, [open, book]);

  if (!open || !book) return null;

  const handleDelete = async (v: CourseVideo) => {
    if (!window.confirm(`למחוק את הסרטון "${v.title}"?`)) return;
    setBusy(true);
    try {
      await deleteVideo(v.id);
      await reload(book.id);
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'שגיאה במחיקה');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (input: VideoInput, editingId: string | null) => {
    if (editingId) {
      const { book_id: _omit, ...patch } = input;
      void _omit;
      await updateVideo(editingId, patch);
    } else {
      await createVideo(input);
    }
    await reload(book.id);
    onChanged();
    setMode(null);
  };

  const inForm = mode !== null;

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
          <button
            onClick={inForm ? () => setMode(null) : onClose}
            className="p-1 text-ink-300 hover:text-ink-100"
            aria-label={inForm ? 'חזרה לרשימה' : 'סגור'}
          >
            {inForm ? <ChevronRight size={20} /> : <X size={20} />}
          </button>
          <div className="flex-1 min-w-0 px-2 text-center">
            <h2 className="text-base font-semibold text-ink-100 truncate">
              {inForm ? (mode === 'new' ? 'סרטון חדש' : 'עריכת סרטון') : 'ניהול סרטונים'}
            </h2>
            <p className="text-xs text-ink-300 truncate mt-0.5">{book.title}</p>
          </div>
          <div className="w-7" />
        </header>

        <div className="flex-1 overflow-y-auto themed-scroll">
          {inForm ? (
            <VideoForm
              key={mode === 'new' ? 'new' : (mode as CourseVideo).id}
              bookId={book.id}
              editing={mode === 'new' ? null : (mode as CourseVideo)}
              defaultSort={(videos?.length ?? 0) * 10 + 10}
              onSubmit={handleSubmit}
            />
          ) : (
            <VideoListView
              videos={videos}
              error={loadError}
              busy={busy}
              onAdd={() => setMode('new')}
              onEdit={(v) => setMode(v)}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────

function VideoListView({
  videos,
  error,
  busy,
  onAdd,
  onEdit,
  onDelete,
}: {
  videos: CourseVideo[] | null;
  error: string | null;
  busy: boolean;
  onAdd: () => void;
  onEdit: (v: CourseVideo) => void;
  onDelete: (v: CourseVideo) => void;
}) {
  return (
    <div className="px-4 py-4 space-y-3">
      <button
        type="button"
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-forest-500/60 text-forest-700 text-sm hover:bg-forest-700/10"
      >
        <Plus size={16} />
        הוסף סרטון
      </button>

      {error && <p className="text-red-400 text-sm text-center py-2">{error}</p>}

      {!videos ? (
        <p className="text-ink-300 text-sm text-center py-6">טוען…</p>
      ) : videos.length === 0 ? (
        <p className="text-ink-300 text-sm text-center py-6">
          אין סרטונים לספר הזה עדיין.
        </p>
      ) : (
        <ul className="space-y-2">
          {videos.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-3 p-2 rounded-2xl bg-surface-raised"
            >
              <div className="shrink-0 w-20 aspect-video rounded-lg overflow-hidden bg-surface-base">
                {videoThumbnail(v) ? (
                  <img src={videoThumbnail(v)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] text-ink-500">
                    {v.provider}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-100 font-medium line-clamp-2">{v.title}</div>
                <div className="text-[11px] text-ink-500 mt-0.5" dir="ltr">
                  {v.provider} · {v.source_id.slice(0, 14)}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(v)}
                  disabled={busy}
                  className="p-1.5 rounded-lg text-ink-300 hover:text-ink-100 hover:bg-surface-card disabled:opacity-50"
                  aria-label="ערוך"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(v)}
                  disabled={busy}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  aria-label="מחק"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Add/edit form ──────────────────────────────────────────────────────────

function VideoForm({
  bookId,
  editing,
  defaultSort,
  onSubmit,
}: {
  bookId: string;
  editing: CourseVideo | null;
  defaultSort: number;
  onSubmit: (input: VideoInput, editingId: string | null) => Promise<void>;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [provider, setProvider] = useState<VideoProvider>(editing?.provider ?? 'youtube');
  // For edit we seed the source field with the stored id; the parser accepts
  // bare ids so it round-trips fine.
  const [source, setSource] = useState(editing?.source_id ?? '');
  const [sortOrder, setSortOrder] = useState(String(editing?.sort_order ?? defaultSort));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedId = parseSourceId(provider, source);
  const canSubmit = title.trim().length > 0 && !!parsedId && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !parsedId) return;
    setSubmitting(true);
    setError(null);
    const parsedSort = Number(sortOrder);
    const input: VideoInput = {
      book_id: bookId,
      title: title.trim(),
      provider,
      source_id: parsedId,
      thumbnail_url: null,
      duration_sec: null,
      sort_order: Number.isFinite(parsedSort) ? parsedSort : defaultSort,
    };
    try {
      await onSubmit(input, editing?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
      setSubmitting(false);
    }
  };

  const thumb =
    parsedId && provider === 'youtube'
      ? `https://i.ytimg.com/vi/${parsedId}/hqdefault.jpg`
      : null;

  return (
    <div className="px-5 py-4 space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 light:text-red-700 text-sm px-3 py-2.5 flex items-start gap-2"
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1 leading-snug">{error}</div>
        </div>
      )}

      <Field label="כותרת הסרטון">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: פרק 1 — חוק ה-1%"
          maxLength={160}
          className={inputCls}
        />
      </Field>

      <Field label="מקור הסרטון">
        <div className="grid grid-cols-2 gap-2">
          <ProviderBtn active={provider === 'youtube'} onClick={() => setProvider('youtube')}>
            YouTube
          </ProviderBtn>
          <ProviderBtn active={provider === 'drive'} onClick={() => setProvider('drive')}>
            Google Drive
          </ProviderBtn>
        </div>
      </Field>

      <Field label={provider === 'youtube' ? 'קישור או מזהה YouTube' : 'קישור או מזהה Drive'}>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={
            provider === 'youtube'
              ? 'https://youtu.be/...  או  dQw4w9WgXcQ'
              : 'https://drive.google.com/file/d/.../view'
          }
          dir="ltr"
          className={`${inputCls} text-left`}
        />
        {source.trim() && (
          <div className="mt-1.5 text-[11px] flex items-center gap-1.5" dir="ltr">
            {parsedId ? (
              <>
                <Check size={13} className="text-forest-700 shrink-0" />
                <span className="text-forest-700 truncate">זוהה מזהה: {parsedId}</span>
              </>
            ) : (
              <span className="text-red-400">לא זוהה מזהה תקין מהקלט</span>
            )}
          </div>
        )}
        {thumb && (
          <div className="mt-2 flex justify-center">
            <img
              src={thumb}
              alt=""
              className="h-24 rounded-md object-cover border border-surface-border"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
          </div>
        )}
      </Field>

      <Field label="סדר תצוגה">
        <input
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          className={`${inputCls} text-center`}
        />
      </Field>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-3 rounded-2xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-on-accent bg-forest-700 hover:bg-forest-800"
      >
        {submitting ? 'שומר...' : editing ? 'שמור שינויים' : 'הוסף סרטון'}
      </button>
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

function ProviderBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 rounded-xl text-sm border transition-colors ${
        active
          ? 'border-forest-500 bg-forest-700/20 text-forest-700'
          : 'border-surface-border bg-surface-raised text-ink-300 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  );
}
