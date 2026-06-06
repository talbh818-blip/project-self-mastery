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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { VisionImage } from './VisionImage';
import { VisionToolbar } from './VisionToolbar';
import { DateBar } from './DateBar';
import { CompassLoader } from '../../components/CompassLoader';
import { uploadVisionImage } from './storage';
import { useAuth } from '../../hooks/useAuth';
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
  /** Current level's icon (Lucide name or emoji char), shown on the DateBar
   *  picker button. null = none chosen yet. */
  icon: string | null;
  /** Open the icon picker for the current level. */
  onIconClick: () => void;
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
  icon,
  onIconClick,
  onChange,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // True while at least one image upload is in flight. Surfaces a soft
  // "uploading" hint so a paste/drop isn't completely silent.
  const [uploadingCount, setUploadingCount] = useState(0);

  // Live ref to the current editor — kept in sync via setter callback below
  // (NOT useEffect, which lags one render and leaves the ref null on the very
  // first interaction). The paste/drop handlers and the "+" callback all read
  // this so they see whatever editor exists right now, even across remounts.
  const editorRef = useRef<Editor | null>(null);

  const uploadAndInsert = useCallback(
    async (file: File) => {
      const ed = editorRef.current;
      if (!ed || !userId) {
        window.alert('העורך עוד לא מוכן — נסה שוב בעוד שנייה.');
        return;
      }
      setUploadingCount((c) => c + 1);
      try {
        const { path, width, height } = await uploadVisionImage(userId, file);
        // After await the editor may have been swapped (period switch) or
        // destroyed (unmount). Re-resolve, and bail with a clear message
        // instead of crashing on a null .chain().
        const live = editorRef.current;
        if (!live) {
          window.alert('העלאה הצליחה אבל העורך נסגר לפני שהתמונה הוכנסה.');
          return;
        }
        const ok = live
          .chain()
          .focus()
          .setVisionImage({ path, width, height, alt: file.name })
          .run();
        console.log('[vision] setVisionImage →', { ok, path, width, height });
        if (!ok) {
          window.alert('לא הצלחנו להכניס את התמונה למסמך — נסה למקם את הסמן בשורה חדשה ולנסות שוב.');
        }
      } catch (err) {
        console.error('[vision] image upload failed', err);
        const msg =
          (err as { message?: string } | null)?.message ?? 'שגיאה לא ידועה';
        window.alert(`העלאת התמונה נכשלה: ${msg}`);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    },
    [userId],
  );

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
        VisionImage,
      ],
      content: normaliseContent(initialContent) as Content,
      editable: !readOnly,
      // onCreate / onDestroy bind the ref synchronously with the editor's own
      // lifecycle. A useEffect-based sync ran one tick late on first mount —
      // long enough for a paste/click to fire and crash on a null ref.
      onCreate({ editor }) {
        editorRef.current = editor;
      },
      onDestroy() {
        editorRef.current = null;
      },
      editorProps: {
        attributes: {
          // RTL is enforced via CSS too, but setting it on the element
          // helps the browser get caret behaviour right.
          dir: 'rtl',
          class: 'focus:outline-none',
        },
        // Intercept clipboard / drag-drop image files: upload them to private
        // storage and insert a visionImage node at the caret. Returning true
        // tells ProseMirror we've handled the event — without that, the
        // browser would also paste a base64 <img> on top.
        handlePaste(_view, event) {
          const files = filesFrom(event.clipboardData);
          if (files.length === 0) return false;
          event.preventDefault();
          for (const file of files) void uploadAndInsert(file);
          return true;
        },
        handleDrop(_view, event) {
          const dt = (event as DragEvent).dataTransfer;
          const files = filesFrom(dt);
          if (files.length === 0) return false;
          event.preventDefault();
          for (const file of files) void uploadAndInsert(file);
          return true;
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
          icon={icon}
          onIconClick={onIconClick}
          saveStatus={saveStatus}
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
          icon={icon}
          onIconClick={onIconClick}
          saveStatus={saveStatus}
        />
        <EditorContent editor={editor} />
      </div>
      {!readOnly && (
        <ToolbarShell>
          <VisionToolbar
            editor={editor}
            assistOn={assistOn}
            onInsertQuestion={insertOneQuestion}
            onPickImage={uploadAndInsert}
            uploadingCount={uploadingCount}
            canUpload={!!userId}
          />
        </ToolbarShell>
      )}
    </>
  );
}

// Pull `image/*` File entries out of a clipboard or drag event. Ignores any
// non-image payload so plain-text paste still goes through Tiptap's defaults.
function filesFrom(
  source: DataTransfer | null | undefined,
): File[] {
  if (!source) return [];
  const list = source.files;
  if (!list || list.length === 0) return [];
  const out: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list.item(i);
    if (f && f.type.startsWith('image/')) out.push(f);
  }
  return out;
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
