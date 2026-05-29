// ============================================================================
// VisionEditor — Tiptap rich-text surface for a single vision entry.
// ----------------------------------------------------------------------------
// The editor itself is uncontrolled: we hand it an initial document on mount
// (and again when the period key changes) and let it own its state from
// there. Every keystroke fires `onChange(json)` so the parent can debounce
// and persist to Supabase.
//
// LAYOUT:
//   • DateBar (top of card): doc date + Assist toggle + save status
//   • EditorContent: the writing surface
//   • Fixed toolbar (above bottom-nav): bold, list-cycle button, highlight
//     colors, and the "+ שאלה" CTA when Assist is on. Save status used to
//     live here — it moved up to the DateBar so the toolbar can stay
//     focused on formatting.
//
// LIST BUTTON: a single control that cycles through
//     none → bullets → numbered → checklist → none
// because three separate buttons cluttered the toolbar and made the
// difference between modes feel less discoverable than a single
// progressively-changing icon.
//
// ASSIST MODE: when the toggle (in DateBar) is on AND this is the first
// time we've seen the toggle on for an empty doc, we auto-inject
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
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  List,
  ListOrdered,
  ListChecks,
  Highlighter,
  Plus,
} from 'lucide-react';
import type { SaveStatus } from './useVisionEntry';
import { useAssistMode } from './useAssistMode';
import { VisionQuestionNode } from './VisionQuestion';
import { DateBar } from './DateBar';
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
  /** ISO 'YYYY-MM-DD' — date stamped at the top of the entry. */
  documentDate: string;
  onDateChange: (iso: string) => void;
  onChange: (json: unknown) => void;
};

const HIGHLIGHT_COLORS = [
  { label: 'צהוב', color: '#fde68a' },
  { label: 'כתום', color: '#fed7aa' },
  { label: 'כחול', color: '#bfdbfe' },
  { label: 'אדום', color: '#fecaca' },
];

type ListMode = 'none' | 'bullet' | 'ordered' | 'task';

export function VisionEditor({
  initialContent,
  resetKey,
  scope,
  placeholder,
  readOnly,
  saveStatus,
  documentDate,
  onDateChange,
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
        TaskList,
        TaskItem.configure({ nested: true }),
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
      <div className="vision-editor vision-page">
        <DateBar
          value={documentDate}
          onChange={onDateChange}
          assistOn={assistOn}
          onToggleAssist={toggleAssist}
          saveStatus={saveStatus}
        />
        <p className="text-ink-300 text-sm">טוען עורך…</p>
      </div>
    );
  }

  const insertOneQuestion = () => {
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
    <div className="vision-editor vision-page">
      <DateBar
        value={documentDate}
        onChange={onDateChange}
        assistOn={assistOn}
        onToggleAssist={toggleAssist}
        saveStatus={saveStatus}
      />
      <EditorContent editor={editor} />
      {!readOnly && (
        <div className="vision-toolbar-fixed">
          <div className="max-w-md mx-auto px-3">
            <Toolbar
              editor={editor}
              assistOn={assistOn}
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
  assistOn,
  onInsertQuestion,
}: {
  editor: Editor;
  assistOn: boolean;
  onInsertQuestion: () => void;
}) {
  const listMode = currentListMode(editor);
  const ListIcon = iconForListMode(listMode);
  const nextLabel = nextListLabel(listMode);

  const cycleList = () => {
    switch (listMode) {
      case 'none':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'bullet':
        // bullet → ordered (Tiptap converts between the two list types
        // when you call the other toggle while inside one).
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'ordered':
        // ordered → task. Need to leave the ordered list first, then
        // wrap into a task list. `toggleOrderedList` undoes the current
        // ordered list; `toggleTaskList` wraps the resulting paragraph.
        editor
          .chain()
          .focus()
          .toggleOrderedList()
          .toggleTaskList()
          .run();
        break;
      case 'task':
        editor.chain().focus().toggleTaskList().run();
        break;
    }
  };

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
        active={listMode !== 'none'}
        onClick={cycleList}
        label={nextLabel}
      >
        {/* RTL flip: Lucide list icons draw bullets on the left + lines on
            the right. In RTL we want bullets on the right, so we mirror
            horizontally. Symmetric icons (Bold, etc.) skip the flip. */}
        <ListIcon size={16} className="scale-x-[-1]" />
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

      {/* "+ שאלה" only when assist is on — toggle itself lives in DateBar */}
      {assistOn && (
        <>
          <div className="mx-1 h-5 w-px bg-surface-border shrink-0" aria-hidden />
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
        </>
      )}
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

// ─── List mode helpers ──────────────────────────────────────────────────────

function currentListMode(editor: Editor): ListMode {
  if (editor.isActive('bulletList')) return 'bullet';
  if (editor.isActive('orderedList')) return 'ordered';
  if (editor.isActive('taskList')) return 'task';
  return 'none';
}

function iconForListMode(mode: ListMode) {
  // Show the icon of the CURRENT mode so the button reflects the doc state.
  // 'none' falls back to the plain bullet icon (which is also what clicking
  // it will produce — the "next action" hint matches the affordance).
  switch (mode) {
    case 'bullet':
      return List;
    case 'ordered':
      return ListOrdered;
    case 'task':
      return ListChecks;
    case 'none':
    default:
      return List;
  }
}

function nextListLabel(mode: ListMode): string {
  switch (mode) {
    case 'none':
      return 'רשימה עם נקודות';
    case 'bullet':
      return 'רשימה ממוספרת';
    case 'ordered':
      return 'רשימת משימות';
    case 'task':
      return 'בטל רשימה';
  }
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
