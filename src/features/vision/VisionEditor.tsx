// ============================================================================
// VisionEditor — Tiptap rich-text surface for a single vision entry.
// ----------------------------------------------------------------------------
// The editor itself is uncontrolled: we hand it an initial document on mount
// (and again when the period key changes) and let it own its state from
// there. Every keystroke fires `onChange(json)` so the parent can debounce
// and persist to Supabase.
//
// Toolbar = Google-Docs-style strip: bold, bullet list, numbered list, and
// four highlighter colors. Buttons reflect the current mark/node so the
// user can tell what's active under the cursor.
// ============================================================================
import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor, type Content } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, List, ListOrdered, Highlighter } from 'lucide-react';

type Props = {
  /** Initial Tiptap JSON document. `null`/empty object → blank doc. */
  initialContent: unknown;
  /** Resets the editor when this changes (e.g. switching period). */
  resetKey: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange: (json: unknown) => void;
};

const HIGHLIGHT_COLORS = [
  { label: 'צהוב', color: '#fde68a' },
  { label: 'כתום', color: '#fed7aa' },
  { label: 'כחול', color: '#bfdbfe' },
  { label: 'אדום', color: '#fecaca' },
];

export function VisionEditor({
  initialContent,
  resetKey,
  placeholder,
  readOnly,
  onChange,
}: Props) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Highlight.configure({ multicolor: true }),
        Placeholder.configure({
          placeholder: placeholder ?? 'התחל לכתוב…',
        }),
      ],
      content: normaliseContent(initialContent) as Content,
      editable: !readOnly,
      editorProps: {
        attributes: {
          // RTL is enforced via CSS too, but setting it on the element
          // helps the browser get caret behaviour right.
          dir: 'rtl',
          class: 'focus:outline-none',
        },
      },
      onUpdate({ editor }) {
        onChange(editor.getJSON());
      },
    },
    // Re-create the editor when the period (and thus initial content)
    // changes — Tiptap's `useEditor` does not react to `content` changes.
    [resetKey],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) {
    return (
      <div className="vision-editor">
        <p className="text-ink-300 text-sm">טוען עורך…</p>
      </div>
    );
  }

  return (
    <div className="vision-editor">
      {!readOnly && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div
      className="
        flex flex-wrap items-center gap-1 mb-3 p-1.5
        rounded-xl bg-surface-card border border-surface-border
        sticky top-0 z-10
      "
      dir="rtl"
    >
      <ToolButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="הדגשה"
      >
        <Bold size={16} />
      </ToolButton>

      <ToolButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="רשימה עם נקודות"
      >
        <List size={16} />
      </ToolButton>

      <ToolButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="רשימה ממוספרת"
      >
        <ListOrdered size={16} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-surface-border" aria-hidden />

      <div className="flex items-center gap-1">
        <Highlighter size={14} className="text-ink-300" aria-hidden />
        {HIGHLIGHT_COLORS.map((h) => {
          const active = editor.isActive('highlight', { color: h.color });
          return (
            <button
              key={h.color}
              type="button"
              aria-label={`הדגשה ${h.label}`}
              onClick={() =>
                editor.chain().focus().toggleHighlight({ color: h.color }).run()
              }
              className={`
                w-6 h-6 rounded-md border transition
                ${active ? 'border-forest-500 ring-2 ring-forest-500/40' : 'border-surface-border hover:border-ink-300'}
              `}
              style={{ backgroundColor: h.color }}
            />
          );
        })}
        {editor.isActive('highlight') && (
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().unsetHighlight().run()
            }
            className="text-xs text-ink-300 hover:text-ink-100 px-1.5 py-0.5"
          >
            נקה
          </button>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`
        w-8 h-8 flex items-center justify-center rounded-lg transition-colors
        ${active
          ? 'bg-forest-700 text-cream-50'
          : 'text-ink-300 hover:bg-surface-raised hover:text-ink-100'}
      `}
    >
      {children}
    </button>
  );
}

// Tiptap rejects empty objects; an empty document is `{ type: 'doc', content: [] }`.
// We normalise the various "empty" shapes the DB might hand us.
function normaliseContent(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length === 0) return null;
  return value;
}
