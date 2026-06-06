// ============================================================================
// VisionToolbar — the formatting strip docked above the keyboard.
// ----------------------------------------------------------------------------
// Layout (RTL, right→left): undo · redo │ size▾ · bold · italic · underline
// │ list▾ · highlight▾ │ (+ שאלה when Assist is on).
//
// "size", "list" and "highlight" are POPOVER buttons: tapping them opens a
// small floating panel ABOVE the button to pick a sub-option. The panels
// are rendered through a portal to <body> so they're never clipped by the
// toolbar's horizontal overflow.
//
// Every button uses onMouseDown→preventDefault so the editor never loses
// its selection/focus when a control is tapped — without that, applying a
// mark would collapse the selection (and on mobile would dismiss the
// keyboard).
// ============================================================================
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Highlighter,
  Plus,
  ImagePlus,
  Loader2,
  type LucideIcon,
} from 'lucide-react';

const HIGHLIGHT_COLORS = [
  { label: 'צהוב', color: '#fde68a' },
  { label: 'כתום', color: '#fed7aa' },
  { label: 'כחול', color: '#bfdbfe' },
  { label: 'אדום', color: '#fecaca' },
];

export function VisionToolbar({
  editor,
  assistOn,
  onInsertQuestion,
  onPickImage,
  uploadingCount,
  canUpload,
}: {
  editor: Editor;
  assistOn: boolean;
  onInsertQuestion: () => void;
  /** Called with the file the user picked / dropped via the "+" button. */
  onPickImage: (file: File) => void | Promise<void>;
  /** Number of uploads currently in flight (paste + drop + picker combined). */
  uploadingCount: number;
  /** False until auth resolves — disables the "+" button so we never try to
   *  upload anonymously. */
  canUpload: boolean;
}) {
  // Re-render on every editor transaction so the active states (bold / italic /
  // underline / heading / list / highlight) and the undo/redo enablement always
  // reflect the CURRENT cursor. Tiptap mutates the editor instance in place, so
  // without this subscription React never re-renders the toolbar after a click
  // or a caret move — a toggled mark looked "stuck", needed extra taps, and the
  // active highlight lagged behind. `transaction` covers both doc and selection
  // changes.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const tick = () => forceRerender((n) => n + 1);
    editor.on('transaction', tick);
    return () => {
      editor.off('transaction', tick);
    };
  }, [editor]);

  // The "+" button forwards its click to a hidden file input. We reset the
  // input's value on every change so picking the SAME file twice in a row
  // still fires onChange the second time (browsers de-dupe identical values).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handlePlusClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const f of files) {
      if (f.type.startsWith('image/')) await onPickImage(f);
    }
  };

  // Icon for the list popover trigger reflects the active list type.
  const listIcon: LucideIcon = editor.isActive('orderedList')
    ? ListOrdered
    : editor.isActive('taskList')
      ? ListChecks
      : List;
  const anyList =
    editor.isActive('bulletList') ||
    editor.isActive('orderedList') ||
    editor.isActive('taskList');

  return (
    <div
      dir="rtl"
      className="
        flex items-center gap-0.5 p-1.5
        rounded-2xl bg-surface-card border border-surface-border
        shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]
      "
    >
      {/* Insert image ("+"). Lives at the right edge in RTL — the first thing
          the eye lands on. Click → hidden file input → upload + insert. */}
      <ToolButton
        label="הוסף תמונה"
        onClick={handlePlusClick}
        disabled={!canUpload}
      >
        {uploadingCount > 0 ? (
          <Loader2 size={23} className="animate-spin" />
        ) : (
          <ImagePlus size={23} />
        )}
      </ToolButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <Sep />

      {/* Undo / Redo */}
      <ToolButton
        label="ביטול"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 size={23} />
      </ToolButton>
      <ToolButton
        label="חזרה על פעולה"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 size={23} />
      </ToolButton>

      <Sep />

      {/* Size (headings) — horizontal, icons only, matching the list menu.
          RTL order: Aa (regular) · H2 · H1. */}
      <Popover
        label="גודל טקסט"
        active={editor.isActive('heading')}
        trigger={<Heading1 size={23} />}
        renderPanel={(close) => (
          <div className="flex items-center gap-1">
            <PanelBtn
              label="טקסט רגיל"
              active={editor.isActive('paragraph')}
              onClick={() => {
                editor.chain().focus().setParagraph().run();
                close();
              }}
            >
              <span className="text-[19px] font-bold leading-none">Aa</span>
            </PanelBtn>
            <PanelBtn
              label="כותרת משנה"
              active={editor.isActive('heading', { level: 2 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
                close();
              }}
            >
              <Heading2 size={23} />
            </PanelBtn>
            <PanelBtn
              label="כותרת"
              active={editor.isActive('heading', { level: 1 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                close();
              }}
            >
              <Heading1 size={23} />
            </PanelBtn>
          </div>
        )}
      />

      {/* Inline marks */}
      <ToolButton
        label="הדגשה"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={23} />
      </ToolButton>
      <ToolButton
        label="נטוי"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={23} />
      </ToolButton>
      <ToolButton
        label="קו תחתון"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={23} />
      </ToolButton>

      <Sep />

      {/* List type */}
      <Popover
        label="רשימה"
        active={anyList}
        trigger={<ListIconFlipped Icon={listIcon} />}
        renderPanel={(close) => (
          <div className="flex items-center gap-1">
            <PanelBtn
              label="רשימה עם נקודות"
              active={editor.isActive('bulletList')}
              onClick={() => {
                editor.chain().focus().toggleBulletList().run();
                close();
              }}
            >
              <ListIconFlipped Icon={List} />
            </PanelBtn>
            <PanelBtn
              label="רשימה ממוספרת"
              active={editor.isActive('orderedList')}
              onClick={() => {
                editor.chain().focus().toggleOrderedList().run();
                close();
              }}
            >
              <ListIconFlipped Icon={ListOrdered} />
            </PanelBtn>
            <PanelBtn
              label="רשימת משימות"
              active={editor.isActive('taskList')}
              onClick={() => {
                editor.chain().focus().toggleTaskList().run();
                close();
              }}
            >
              <ListIconFlipped Icon={ListChecks} />
            </PanelBtn>
          </div>
        )}
      />

      {/* Highlight color */}
      <Popover
        label="צבע הדגשה"
        active={editor.isActive('highlight')}
        trigger={<Highlighter size={23} />}
        renderPanel={(close) => (
          <div className="flex items-center gap-1">
            {HIGHLIGHT_COLORS.map((h) => {
              const active = editor.isActive('highlight', { color: h.color });
              return (
                <button
                  key={h.color}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label={`הדגשה ${h.label}`}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .toggleHighlight({ color: h.color })
                      .run();
                    close();
                  }}
                  className={`w-7 h-7 rounded-lg border transition ${
                    active
                      ? 'border-forest-500 ring-2 ring-forest-500/40'
                      : 'border-surface-border hover:border-ink-300'
                  }`}
                  style={{ backgroundColor: h.color }}
                />
              );
            })}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              aria-label="נקה הדגשה"
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                close();
              }}
              className="px-2 h-7 rounded-lg text-[11px] text-ink-300 hover:text-ink-100 hover:bg-surface-raised"
            >
              נקה
            </button>
          </div>
        )}
      />

      {/* Assist question inserter */}
      {assistOn && (
        <>
          <Sep />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onInsertQuestion}
            aria-label="הוסף שאלה מנחה"
            className="
              shrink-0 inline-flex items-center gap-1 px-2.5 h-10 rounded-lg
              text-[13px] font-medium text-on-accent bg-forest-700
              hover:bg-forest-600 transition-colors
            "
          >
            <Plus size={15} strokeWidth={2.4} />
            שאלה
          </button>
        </>
      )}
    </div>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────────

// Width-agnostic on purpose: main toolbar buttons add `flex-1` so they
// spread across the FULL bar width (no empty gutter); popover panel buttons
// add a fixed `w-10`.
function toolBtnClass(active: boolean): string {
  return [
    'h-10 flex items-center justify-center rounded-lg transition-colors',
    'disabled:opacity-30 disabled:pointer-events-none',
    active
      ? 'bg-forest-700 text-on-accent'
      : 'text-ink-300 hover:bg-surface-raised hover:text-ink-100',
  ].join(' ');
}

function ToolButton({
  active = false,
  disabled = false,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex-1 ${toolBtnClass(active)}`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-5 w-px bg-surface-border shrink-0" aria-hidden />;
}

// Lucide list icons draw bullets/numbers on the LEFT — mirror them so the
// markers sit on the RIGHT in RTL.
function ListIconFlipped({ Icon }: { Icon: LucideIcon }) {
  return <Icon size={23} className="scale-x-[-1]" />;
}

// ─── Popover ────────────────────────────────────────────────────────────────

function Popover({
  label,
  trigger,
  active,
  renderPanel,
}: {
  label: string;
  trigger: ReactNode;
  active?: boolean;
  renderPanel: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(
    null,
  );

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setAnchor({ cx: r.left + r.width / 2, top: r.top });
    setOpen(true);
  };

  // Close the popover if the viewport changes (keyboard slide / rotate),
  // since the panel is positioned once from a snapshot of the trigger rect.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.visualViewport?.addEventListener('resize', close);
    window.addEventListener('resize', close);
    return () => {
      window.visualViewport?.removeEventListener('resize', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className={`flex-1 ${toolBtnClass(!!active || open)}`}
      >
        {trigger}
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            className="fixed inset-0 z-[55]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
          >
            <div
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
              className="
                absolute bg-surface-card border border-surface-border
                rounded-2xl shadow-xl p-1.5
              "
              style={{
                left: anchor.cx,
                top: anchor.top,
                transform: 'translate(-50%, calc(-100% - 8px))',
              }}
            >
              {renderPanel(() => setOpen(false))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Horizontal panel option (icon-only, square).
function PanelBtn({
  active = false,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`w-10 ${toolBtnClass(active)}`}
    >
      {children}
    </button>
  );
}

