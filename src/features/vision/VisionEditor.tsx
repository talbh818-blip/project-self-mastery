// ============================================================================
// VisionEditor — Tiptap rich-text surface for a single vision entry.
// ----------------------------------------------------------------------------
// The editor itself is uncontrolled: we hand it an initial document on mount
// (and again when the period key changes) and let it own its state from
// there. Every keystroke fires `onChange(json)` so the parent can debounce
// and persist to Supabase.
//
// The formatting toolbar is rendered FIXED at the bottom of the viewport,
// just above the bottom-nav (.vision-toolbar-fixed handles the geometry).
// The save status badge ("שומר…" / "נשמר") rides on the same row so the
// user has one consolidated control strip while writing.
//
// Assist mode: when enabled, two extra controls appear in the toolbar —
// the assist toggle itself (💡) and "+ שאלה" which injects a question.
// The first time Assist is turned on against an empty doc, we auto-inject
// STARTER_QUESTION_COUNT questions so the user has something to react to.
// ============================================================================
import { useEffect, useRef } from 'react';
import {
  useEditor,
  EditorContent,
  type Editor,
  type Content,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  List,
  ListOrdered,
  Highlighter,
  CheckCircle2,
  Lightbulb,
  Plus,
} from 'lucide-react';
import type { SaveStatus } from './useVisionEntry';
import { useAssistMode } from './useAssistMode';
import { VisionQuestionNode } from './VisionQuestion';
import {
  pickQuestion,
  STARTER_QUESTION_COUNT,
  type VisionQuestion,
} from './questions';
import type { VisionScope } from './period';

type Props = {
  /** Initial Tiptap JSON document. `null`/empty object → blank doc. */
  initialContent: unknown;
  /** Resets the editor when this changes (e.g. switching period). */
  resetKey: string;
  scope: VisionScope;
  placeholder?: string;
  readOnly?: boolean;
  saveStatus: SaveStatus;
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
  scope,
  placeholder,
  readOnly,
  saveStatus,
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
        VisionQuestionNode,
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

  const { enabled: assistOn, toggle: toggleAssist } = useAssistMode();

  // First time Assist activates on this period — if the doc is empty, seed
  // it with a few starter questions so the user has something to react to.
  // We use a ref to make sure we only seed once per (editor, scope, on→true).
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (!assistOn) return;
    const key = `${resetKey}`;
    if (seededForRef.current === key) return;
    if (!isDocEmpty(editor)) {
      seededForRef.current = key; // mark seen even if non-empty
      return;
    }
    const used = new Set<string>();
    const picks: VisionQuestion[] = [];
    for (let i = 0; i < STARTER_QUESTION_COUNT; i++) {
      const q = pickQuestion(scope, used);
      used.add(q.id);
      picks.push(q);
    }
    const content = picks.flatMap((q) => [
      {
        type: 'visionQuestion',
        attrs: { questionId: q.id, scope, text: q.text },
      },
      { type: 'paragraph' },
    ]);
    editor.chain().focus().insertContent(content).run();
    seededForRef.current = key;
  }, [assistOn, editor, scope, resetKey]);

  if (!editor) {
    return (
      <div className="vision-editor">
        <p className="text-ink-300 text-sm">טוען עורך…</p>
      </div>
    );
  }

  const insertOneQuestion = () => {
    if (!editor) return;
    const used = new Set<string>();
    editor.state.doc.descendants((n) => {
      if (n.type.name !== 'visionQuestion') return;
      const id = n.attrs?.questionId;
      if (typeof id === 'string' && id) used.add(id);
    });
    const q = pickQuestion(scope, used);
    editor
      .chain()
      .focus()
      .insertVisionQuestion({ questionId: q.id, scope, text: q.text })
      .run();
  };

  return (
    <div className="vision-editor">
      <EditorContent editor={editor} />
      {!readOnly && (
        <div className="vision-toolbar-fixed">
          <div className="max-w-md mx-auto px-3">
            <Toolbar
              editor={editor}
              saveStatus={saveStatus}
              assistOn={assistOn}
              onToggleAssist={toggleAssist}
              onInsertQuestion={insertOneQuestion}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  editor,
  saveStatus,
  assistOn,
  onToggleAssist,
  onInsertQuestion,
}: {
  editor: Editor;
  saveStatus: SaveStatus;
  assistOn: boolean;
  onToggleAssist: () => void;
  onInsertQuestion: () => void;
}) {
  return (
    <div
      dir="rtl"
      className="
        flex items-center gap-1 p-1.5
        rounded-2xl bg-surface-card border border-surface-border
        shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]
        overflow-x-auto
      "
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

      <div className="mx-1 h-5 w-px bg-surface-border shrink-0" aria-hidden />

      <Highlighter size={14} className="text-ink-300 shrink-0" aria-hidden />
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
              shrink-0 w-6 h-6 rounded-md border transition
              ${active ? 'border-forest-500 ring-2 ring-forest-500/40' : 'border-surface-border hover:border-ink-300'}
            `}
            style={{ backgroundColor: h.color }}
          />
        );
      })}

      <div className="mx-1 h-5 w-px bg-surface-border shrink-0" aria-hidden />

      {/* Assist toggle — lit up when active */}
      <ToolButton
        active={assistOn}
        onClick={onToggleAssist}
        label="מצב מודרך — שאלות מנחות"
      >
        <Lightbulb size={16} />
      </ToolButton>

      {/* Only visible when assist is on. Inserts one fresh question. */}
      {assistOn && (
        <button
          type="button"
          onClick={onInsertQuestion}
          aria-label="הוסף שאלה מנחה"
          className="
            shrink-0 inline-flex items-center gap-1 px-2 h-8 rounded-lg
            text-[12px] font-medium text-cream-50 bg-forest-700
            hover:bg-forest-600 transition-colors
          "
        >
          <Plus size={13} strokeWidth={2.4} />
          שאלה
        </button>
      )}

      {/* Push save status to the LEFT (visual end in RTL). */}
      <div className="grow" />
      <SaveBadge status={saveStatus} />
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const text =
    status === 'pending' || status === 'saving'
      ? 'שומר…'
      : status === 'saved'
        ? 'נשמר'
        : 'שגיאה';
  const color =
    status === 'error'
      ? 'text-red-400'
      : status === 'saved'
        ? 'text-forest-500'
        : 'text-ink-300';
  return (
    <span
      className={`text-[11px] ${color} flex items-center gap-1 shrink-0 pl-1`}
    >
      {status === 'saved' && <CheckCircle2 size={11} />}
      {text}
    </span>
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
        shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors
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

/**
 * "Empty" = no real content. We consider a single empty paragraph empty
 * (Tiptap inserts one by default) but anything beyond it counts.
 */
function isDocEmpty(editor: Editor): boolean {
  const doc = editor.state.doc;
  if (doc.childCount === 0) return true;
  if (doc.childCount > 1) return false;
  const first = doc.firstChild;
  if (!first) return true;
  return first.type.name === 'paragraph' && first.content.size === 0;
}
