// ============================================================================
// DevBoardAdminPanel — a Trello-style planning board under the "פיתוח" tab.
// ----------------------------------------------------------------------------
// The app owner arranges named columns (בקרוב / השבוע / בפיתוח …) holding task
// cards. Each card has a title, a free-text description, and a color label the
// owner picks. Cards drag between and within columns (HTML5 drag-and-drop, the
// same pattern the admin sidebar uses); the board is admin-only end to end
// (RLS in migration 0053).
//
// Ordering: `cards` is kept as a flat array in visual order. Rendering filters
// by column, which preserves per-column order; a drag live-reorders the array
// and, on drop, reindexes the affected column(s)' `position` and persists them.
// ============================================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2, RefreshCw, Check, X } from 'lucide-react';
import {
  fetchDevBoard,
  createColumn,
  renameColumn,
  deleteColumn,
  createCard,
  updateCard,
  deleteCard,
  persistCardPlacements,
  type DevColumn,
  type DevCard,
  type DevCardColor,
} from './devBoard';
import { CompassLoader } from '../../components/CompassLoader';

// Keyed label palette. Stored value is the key; the hex + Hebrew label live
// here so the DB stays palette-agnostic. Unknown keys fall back to 'slate'.
const CARD_COLORS: { key: DevCardColor; hex: string; label: string }[] = [
  { key: 'slate', hex: '#64748b', label: 'אפור' },
  { key: 'red', hex: '#ef4444', label: 'אדום' },
  { key: 'orange', hex: '#f97316', label: 'כתום' },
  { key: 'yellow', hex: '#eab308', label: 'צהוב' },
  { key: 'green', hex: '#22c55e', label: 'ירוק' },
  { key: 'teal', hex: '#14b8a6', label: 'טורקיז' },
  { key: 'blue', hex: '#3b82f6', label: 'כחול' },
  { key: 'purple', hex: '#a855f7', label: 'סגול' },
  { key: 'pink', hex: '#ec4899', label: 'ורוד' },
];
const colorHex = (c: string): string =>
  CARD_COLORS.find((x) => x.key === c)?.hex ?? '#64748b';

// Card being edited/created in the modal. `card: null` → composing a new card
// in `columnId`.
type EditorState = { columnId: string; card: DevCard | null };

export function DevBoardAdminPanel() {
  const [columns, setColumns] = useState<DevColumn[] | null>(null);
  const [cards, setCards] = useState<DevCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-column composer + inline column rename.
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  // Card editor modal.
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Drag state. `dragOriginCol` remembers where the card started so we know
  // which columns to reindex on drop. `cardsRef` mirrors `cards` so the
  // drag-end handler reads the freshest arrangement without stale closure.
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const dragOriginCol = useRef<string | null>(null);
  const cardsRef = useRef<DevCard[]>(cards);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Board fills the viewport down to just above the bottom nav — measured so
  // the columns "reach the bottom" on any screen instead of sizing to content.
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardH, setBoardH] = useState<number>();
  useLayoutEffect(() => {
    const measure = () => {
      const el = boardRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // 96px ≈ the page's bottom runway (pb-24), which clears the fixed nav.
      setBoardH(Math.max(320, Math.round(window.innerHeight - top - 96)));
    };
    measure();
    const onWin = () => window.requestAnimationFrame(measure);
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, { passive: true });
    const t = window.setTimeout(measure, 250); // after fonts/layout settle
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin);
      window.clearTimeout(t);
    };
  }, [columns]);

  // Grab-and-pan the whole board horizontally (Trello-style): a mouse drag on
  // any empty board/column area scrolls sideways. Interactive elements (cards,
  // buttons, inputs) are skipped so their own gestures still work; touch keeps
  // its native horizontal scroll.
  const pan = useRef({ x: 0, left: 0, active: false });
  const onPanStart = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, textarea, [draggable="true"]')) return;
    const el = boardRef.current;
    if (!el) return;
    pan.current = { x: e.clientX, left: el.scrollLeft, active: true };
    el.setPointerCapture(e.pointerId);
  };
  const onPanMove = (e: React.PointerEvent) => {
    if (!pan.current.active) return;
    const el = boardRef.current;
    if (el) el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
  };
  const onPanEnd = (e: React.PointerEvent) => {
    if (!pan.current.active) return;
    pan.current.active = false;
    try {
      boardRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released — ignore
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const { columns, cards } = await fetchDevBoard();
      setColumns(columns);
      setCards(cards);
    } catch (e) {
      setError(describeError(e, 'שגיאה בטעינה'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cardsInColumn = (colId: string) =>
    cards.filter((c) => c.column_id === colId);

  // ---- Columns --------------------------------------------------------------
  const handleAddColumn = async () => {
    const title = newColTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const col = await createColumn(title, columns?.length ?? 0);
      setColumns((prev) => [...(prev ?? []), col]);
      setNewColTitle('');
      setNewColOpen(false);
    } catch (e) {
      setError(describeError(e, 'שגיאה בהוספת עמודה'));
    } finally {
      setBusy(false);
    }
  };

  const handleRenameColumn = async (id: string) => {
    const title = renameText.trim();
    if (!title) {
      setRenamingColId(null);
      return;
    }
    setBusy(true);
    try {
      await renameColumn(id, title);
      setColumns((prev) =>
        (prev ?? []).map((c) => (c.id === id ? { ...c, title } : c)),
      );
      setRenamingColId(null);
    } catch (e) {
      setError(describeError(e, 'שגיאה בשינוי שם'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteColumn = async (col: DevColumn) => {
    const count = cardsInColumn(col.id).length;
    if (
      !window.confirm(
        count > 0
          ? `למחוק את העמודה "${col.title}" ואת ${count} המשימות שבתוכה?\nאי אפשר לבטל.`
          : `למחוק את העמודה "${col.title}"?`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteColumn(col.id);
      setColumns((prev) => (prev ?? []).filter((c) => c.id !== col.id));
      setCards((prev) => prev.filter((c) => c.column_id !== col.id));
    } catch (e) {
      setError(describeError(e, 'שגיאה במחיקת עמודה'));
    } finally {
      setBusy(false);
    }
  };

  // ---- Card editor (create / update / delete) -------------------------------
  const handleSaveCard = async (input: {
    title: string;
    description: string | null;
    color: DevCardColor;
  }) => {
    if (!editor) return;
    setBusy(true);
    try {
      if (editor.card) {
        await updateCard(editor.card.id, input);
        setCards((prev) =>
          prev.map((c) => (c.id === editor.card!.id ? { ...c, ...input } : c)),
        );
      } else {
        const position = cardsInColumn(editor.columnId).length;
        const card = await createCard({
          columnId: editor.columnId,
          title: input.title,
          description: input.description,
          color: input.color,
          position,
        });
        setCards((prev) => [...prev, card]);
      }
      setEditor(null);
    } catch (e) {
      setError(describeError(e, 'שגיאה בשמירת המשימה'));
      throw e; // keep the modal open on failure
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCard = async (card: DevCard) => {
    if (!window.confirm(`למחוק את המשימה "${card.title}"?`)) return;
    setBusy(true);
    try {
      await deleteCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setEditor(null);
    } catch (e) {
      setError(describeError(e, 'שגיאה במחיקת המשימה'));
    } finally {
      setBusy(false);
    }
  };

  // ---- Drag and drop --------------------------------------------------------
  // Live-reorder the flat array while dragging: place the dragged card just
  // before `beforeCardId`, or at the end of `targetColId` when null.
  const moveDraggedTo = (targetColId: string, beforeCardId: string | null) => {
    setCards((prev) => {
      const dragId = dragCardId;
      if (!dragId || dragId === beforeCardId) return prev;
      const idx = prev.findIndex((c) => c.id === dragId);
      if (idx < 0) return prev;
      const moved = { ...prev[idx], column_id: targetColId };
      const next = prev.slice();
      next.splice(idx, 1);
      let insertAt: number;
      if (beforeCardId) {
        insertAt = next.findIndex((c) => c.id === beforeCardId);
        if (insertAt < 0) insertAt = next.length;
      } else {
        let lastIdx = -1;
        for (let i = 0; i < next.length; i++) {
          if (next[i].column_id === targetColId) lastIdx = i;
        }
        insertAt = lastIdx >= 0 ? lastIdx + 1 : next.length;
      }
      next.splice(insertAt, 0, moved);
      return next;
    });
  };

  const onCardDragStart = (card: DevCard) => {
    setDragCardId(card.id);
    dragOriginCol.current = card.column_id;
  };

  // Reindex the touched column(s) and persist only those rows.
  const onCardDragEnd = () => {
    const origin = dragOriginCol.current;
    const current = cardsRef.current.find((c) => c.id === dragCardId)?.column_id;
    const touched = Array.from(
      new Set([origin, current].filter((x): x is string => Boolean(x))),
    );
    setDragCardId(null);
    dragOriginCol.current = null;
    if (touched.length === 0) return;

    const items: { id: string; column_id: string; position: number }[] = [];
    for (const colId of touched) {
      cardsRef.current
        .filter((c) => c.column_id === colId)
        .forEach((c, i) => items.push({ id: c.id, column_id: colId, position: i }));
    }
    void persistCardPlacements(items).catch((e) => {
      setError(describeError(e, 'שגיאה בשמירת הסידור'));
      void load(); // resync on failure
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">לוח פיתוח</h2>
          <p className="text-xs text-ink-300">
            עמודות ומשימות בסגנון טרלו — גררו משימה בין עמודות.
          </p>
        </div>
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

      {columns === null && !error && (
        <div className="py-8">
          <CompassLoader size="md" />
        </div>
      )}

      {columns !== null && (
        // Horizontal board. dir=rtl → the first column sits on the right.
        // .shelf-scroll is the themed horizontal scrollbar (index.css). Height
        // is measured so columns fill down to the bottom; a mouse drag pans it.
        <div
          ref={boardRef}
          dir="rtl"
          className="shelf-scroll cursor-grab select-none overflow-x-auto overflow-y-hidden active:cursor-grabbing"
          style={{ height: boardH ?? '70vh' }}
          onPointerDown={onPanStart}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerCancel={onPanEnd}
        >
          <div className="flex h-full w-max items-stretch gap-3 pb-2">
            {columns.map((col) => (
              <BoardColumn
                key={col.id}
                col={col}
                cards={cardsInColumn(col.id)}
                busy={busy}
                dragCardId={dragCardId}
                renaming={renamingColId === col.id}
                renameText={renameText}
                onRenameTextChange={setRenameText}
                onStartRename={() => {
                  setRenamingColId(col.id);
                  setRenameText(col.title);
                }}
                onCommitRename={() => void handleRenameColumn(col.id)}
                onCancelRename={() => setRenamingColId(null)}
                onDelete={() => void handleDeleteColumn(col)}
                onAddCard={() => setEditor({ columnId: col.id, card: null })}
                onOpenCard={(card) => setEditor({ columnId: col.id, card })}
                onCardDragStart={onCardDragStart}
                onCardDragEnd={onCardDragEnd}
                onMoveBeforeCard={(beforeId) => moveDraggedTo(col.id, beforeId)}
                onMoveToEnd={() => moveDraggedTo(col.id, null)}
              />
            ))}

            {/* Add-column tile — top-aligned so it doesn't stretch full height */}
            <div className="w-72 shrink-0 self-start">
              {newColOpen ? (
                <div className="rounded-2xl border border-surface-border bg-surface-card p-3">
                  <input
                    autoFocus
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAddColumn();
                      if (e.key === 'Escape') {
                        setNewColOpen(false);
                        setNewColTitle('');
                      }
                    }}
                    dir="rtl"
                    placeholder="שם העמודה (למשל: בקרוב)"
                    className="w-full rounded-lg bg-surface-raised border border-surface-border px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-forest-600"
                  />
                  <div className="mt-2 flex gap-2 justify-end">
                    <ActionBtn
                      onClick={() => void handleAddColumn()}
                      disabled={busy || newColTitle.trim().length === 0}
                      icon={<Check size={14} />}
                      label="הוסף"
                      variant="primary"
                    />
                    <ActionBtn
                      onClick={() => {
                        setNewColOpen(false);
                        setNewColTitle('');
                      }}
                      disabled={busy}
                      icon={<X size={14} />}
                      label="בטל"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewColOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-border bg-surface-card/40 px-4 py-3 text-sm font-medium text-ink-300 transition-colors hover:text-ink-100 hover:bg-surface-card"
                >
                  <Plus size={16} />
                  הוסף עמודה
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editor && (
        <CardEditor
          key={editor.card?.id ?? 'new'}
          card={editor.card}
          busy={busy}
          onSave={handleSaveCard}
          onDelete={editor.card ? () => void handleDeleteCard(editor.card!) : undefined}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------
function BoardColumn({
  col,
  cards,
  busy,
  dragCardId,
  renaming,
  renameText,
  onRenameTextChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onAddCard,
  onOpenCard,
  onCardDragStart,
  onCardDragEnd,
  onMoveBeforeCard,
  onMoveToEnd,
}: {
  col: DevColumn;
  cards: DevCard[];
  busy: boolean;
  dragCardId: string | null;
  renaming: boolean;
  renameText: string;
  onRenameTextChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onAddCard: () => void;
  onOpenCard: (card: DevCard) => void;
  onCardDragStart: (card: DevCard) => void;
  onCardDragEnd: () => void;
  onMoveBeforeCard: (beforeId: string) => void;
  onMoveToEnd: () => void;
}) {
  const dragging = dragCardId !== null;
  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-2xl border border-surface-border bg-surface-card">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-border">
        {renaming ? (
          <input
            autoFocus
            value={renameText}
            onChange={(e) => onRenameTextChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            dir="rtl"
            className="flex-1 min-w-0 rounded-lg bg-surface-raised border border-surface-border px-2 py-1 text-sm font-semibold text-ink-100 focus:outline-none focus:border-forest-600"
          />
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            title="לחצו לשינוי שם"
            className="flex-1 min-w-0 text-right text-sm font-semibold text-ink-100 truncate hover:text-forest-700"
          >
            {col.title}
          </button>
        )}
        <span className="shrink-0 text-[11px] tabular-nums text-ink-300 bg-surface-raised rounded-full px-1.5 py-0.5">
          {cards.length}
        </span>
        <IconBtn onClick={onDelete} disabled={busy} label="מחק עמודה" danger>
          <Trash2 size={14} />
        </IconBtn>
      </div>

      {/* Cards — a scrollable, full-height drop area. dragOver on the body (not
          intercepted by a card) appends to the end of this column. The dir=ltr
          wrapper parks the green scrollbar on the right (the RTL end). */}
      <div dir="ltr" className="min-h-0 flex-1 overflow-y-auto vision-feed-scroll">
        <div
          dir="rtl"
          className="flex min-h-full flex-col gap-2 p-2"
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            onMoveToEnd();
          }}
        >
          {cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              isDragging={dragCardId === card.id}
              onOpen={() => onOpenCard(card)}
              onDragStart={() => onCardDragStart(card)}
              onDragEnd={onCardDragEnd}
              onDragOverCard={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.stopPropagation(); // don't also trigger the column's move-to-end
                onMoveBeforeCard(card.id);
              }}
            />
          ))}

          {cards.length === 0 && (
            <div className="rounded-xl border border-dashed border-surface-border/70 px-3 py-6 text-center text-xs text-ink-500">
              אין משימות
            </div>
          )}
        </div>
      </div>

      {/* Add-task — pinned at the column's bottom (Trello-style). */}
      <div className="border-t border-surface-border/60 p-2">
        <button
          type="button"
          onClick={onAddCard}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink-300 transition-colors hover:bg-surface-raised hover:text-ink-100"
        >
          <Plus size={15} />
          הוסף משימה
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
function CardTile({
  card,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: {
  card: DevCard;
  isDragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onClick={onOpen}
      className={`cursor-pointer rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 transition-shadow hover:border-forest-600/60 active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {/* Color label — the Trello top strip. */}
      <span
        className="mb-2 block h-1.5 w-10 rounded-full"
        style={{ backgroundColor: colorHex(card.color) }}
        aria-hidden
      />
      <p className="text-sm font-medium text-ink-100 leading-snug break-words">
        {card.title}
      </p>
      {card.description && card.description.trim().length > 0 && (
        <p className="mt-1 text-xs text-ink-300 leading-relaxed line-clamp-2 break-words">
          {card.description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card editor modal (create / edit)
// ---------------------------------------------------------------------------
function CardEditor({
  card,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  card: DevCard | null;
  busy: boolean;
  onSave: (input: {
    title: string;
    description: string | null;
    color: DevCardColor;
  }) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card?.title ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [color, setColor] = useState<DevCardColor>(card?.color ?? 'slate');

  const canSave = title.trim().length > 0 && !busy;
  const submit = () => {
    if (!canSave) return;
    void onSave({
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      color,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-100">
            {card ? 'עריכת משימה' : 'משימה חדשה'}
          </h3>
          <IconBtn onClick={onClose} disabled={busy} label="סגור">
            <X size={16} />
          </IconBtn>
        </div>

        {/* Title */}
        <label className="mb-1 block text-xs text-ink-300">כותרת</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          dir="rtl"
          placeholder="מה צריך לעשות?"
          className="mb-3 w-full rounded-lg bg-surface-raised border border-surface-border px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-forest-600"
        />

        {/* Description */}
        <label className="mb-1 block text-xs text-ink-300">תיאור</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          dir="rtl"
          placeholder="פרטים על המשימה…"
          className="mb-3 w-full resize-none rounded-lg bg-surface-raised border border-surface-border px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-forest-600"
        />

        {/* Color picker */}
        <label className="mb-1.5 block text-xs text-ink-300">תג צבע</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => {
            const selected = color === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setColor(c.key)}
                title={c.label}
                aria-label={c.label}
                aria-pressed={selected}
                className={`h-7 w-7 rounded-full flex items-center justify-center transition-transform ${
                  selected ? 'ring-2 ring-ink-100 scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.hex }}
              >
                {selected && <Check size={14} className="text-white" />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <div>
            {onDelete && (
              <ActionBtn
                onClick={onDelete}
                disabled={busy}
                icon={<Trash2 size={14} />}
                label="מחק"
                variant="danger"
              />
            )}
          </div>
          <div className="flex gap-2">
            <ActionBtn
              onClick={onClose}
              disabled={busy}
              icon={<X size={14} />}
              label="בטל"
            />
            <ActionBtn
              onClick={submit}
              disabled={!canSave}
              icon={<Check size={14} />}
              label="שמור"
              variant="primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits (kept local, matching the other admin panels' style)
// ---------------------------------------------------------------------------
function IconBtn({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? 'border-red-500/60 text-red-400 hover:bg-red-500/10'
          : 'border-surface-border text-ink-300 hover:text-ink-100 hover:bg-surface-raised'
      }`}
    >
      {children}
    </button>
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
  variant?: 'default' | 'primary' | 'danger';
}) {
  const styles =
    variant === 'primary'
      ? 'border-forest-500/60 text-forest-700 hover:bg-forest-500/10'
      : variant === 'danger'
        ? 'border-red-500/60 text-red-400 hover:bg-red-500/10'
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
