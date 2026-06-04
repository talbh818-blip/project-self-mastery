// ============================================================================
// VisionEditor — Tiptap rich-text surface for a single vision entry.
// ----------------------------------------------------------------------------
// The editor is uncontrolled: it receives an initial document on mount (and
// again when the period key changes) and owns its state from there. Every
// keystroke fires `onChange(json)` so the parent can debounce + persist.
//
// LAYOUT:
//   • DateBar (top of card): doc date + Assist toggle + save status
//   • EditorContent: the writing surface
//   • VisionToolbar (fixed, rides above the keyboard): size / bold / italic /
//     underline / list / highlight / undo-redo, plus "+ שאלה" in Assist mode.
//
// ASSIST MODE: when the toggle (in DateBar) is on AND this is the first time
// we've seen it on for an empty doc, we auto-inject STARTER_QUESTION_COUNT
// questions so the user has something to react to.
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
import type { SaveStatus } from './useVisionEntry';
import { useAssistMode } from './useAssistMode';
import { useKeyboardTracking } from './useKeyboardTracking';
import { VisionQuestionNode } from './VisionQuestion';
import { VisionToolbar } from './VisionToolbar';
import { DateBar } from './DateBar';
import { CompassLoader } from '../../components/CompassLoader';
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
  /** Direction of the scope-switch zoom: 'in' (finer) or 'out' (broader). */
  zoomDir: 'in' | 'out';
  /** ISO 'YYYY-MM-DD' — date stamped at the top of the entry. */
  documentDate: string;
  onDateChange: (iso: string) => void;
  /** "Jump to current period" control shown in the DateBar; null = hidden. */
  jumpToNow: { label: string; onJump: () => void } | null;
  onChange: (json: unknown) => void;
};

export function VisionEditor({
  initialContent,
  resetKey,
  scope,
  placeholder,
  readOnly,
  saveStatus,
  zoomDir,
  documentDate,
  onDateChange,
  jumpToNow,
  onChange,
}: Props) {
  const editor = useEditor(
    {
      extensions: [
        // Limit headings to H1/H2 — the size menu only offers those two.
        StarterKit.configure({ heading: { levels: [1, 2] } }),
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
  // A ref makes sure we only seed once per (editor, scope, on→true).
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
          jumpToNow={jumpToNow}
        />
        <div className="py-8">
          <CompassLoader size="md" />
        </div>
      </div>
    );
  }

  // Key the card by scope so the zoom animation replays ONLY when the scope
  // changes (not on period changes). The toolbar is a SIBLING below — never
  // inside this transformed card — so the zoom can't disturb the fixed bar.
  const cardClass = `vision-editor vision-page vision-zoom-${zoomDir}`;

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
    <>
      <div key={scope} className={cardClass}>
        <DateBar
          value={documentDate}
          onChange={onDateChange}
          assistOn={assistOn}
          onToggleAssist={toggleAssist}
          saveStatus={saveStatus}
          jumpToNow={jumpToNow}
        />
        <EditorContent editor={editor} />
      </div>
      {!readOnly && (
        <ToolbarShell>
          <VisionToolbar
            editor={editor}
            assistOn={assistOn}
            onInsertQuestion={insertOneQuestion}
          />
        </ToolbarShell>
      )}
    </>
  );
}

/**
 * Wraps the fixed-bottom toolbar. `useKeyboardTracking` writes the live
 * keyboard height into the `--vision-kb` CSS var; `.vision-toolbar-fixed`
 * reads it to glue the toolbar to whichever is higher — the bottom-nav
 * dock or the top of the on-screen keyboard. No React state in the hot
 * path, so the follow is smooth.
 */
function ToolbarShell({ children }: { children: React.ReactNode }) {
  useKeyboardTracking();
  return (
    <div className="vision-toolbar-fixed">
      <div className="max-w-md mx-auto px-3">{children}</div>
    </div>
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
