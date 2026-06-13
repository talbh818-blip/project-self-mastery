// ============================================================================
// useVisionTiptapEditor — the shared Tiptap "engine" for a vision entry.
// ----------------------------------------------------------------------------
// Both the MOBILE editor (VisionEditor, bottom-fixed toolbar) and the DESKTOP
// editor (VisionEditorDesktop, Google-Docs-style top toolbar) create the very
// same editor instance through this hook, so the extension set, RTL handling,
// image paste/drop + upload, and the change/normalisation behaviour can NEVER
// drift between the two layouts. The layouts differ ONLY in chrome (where the
// toolbar / nav sit) — the writing surface itself is one engine.
//
// Returns the live `editor`, the `uploadAndInsert(file)` helper the toolbar's
// "+" button calls, and `uploadingCount` (uploads in flight) for a soft hint.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useEditor,
  type Editor,
  type Content,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { VisionQuestionNode } from './VisionQuestion';
import { VisionImage } from './VisionImage';
import { uploadVisionImage } from './storage';
import { useAuth } from '../../hooks/useAuth';
import { pickQuestion } from './questions';
import type { VisionScope } from './period';

type Options = {
  /** Initial Tiptap JSON document. `null`/empty object → blank doc. */
  initialContent: unknown;
  /** Re-creates the editor when this changes (e.g. switching period). */
  resetKey: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange: (json: unknown) => void;
};

export function useVisionTiptapEditor({
  initialContent,
  resetKey,
  placeholder,
  readOnly,
  onChange,
}: Options) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // True while at least one image upload is in flight. Surfaces a soft
  // "uploading" hint so a paste/drop isn't completely silent.
  const [uploadingCount, setUploadingCount] = useState(0);

  // Live ref to the current editor — kept in sync via the onCreate/onDestroy
  // lifecycle callbacks (NOT useEffect, which lags one render and leaves the
  // ref null on the very first interaction). The paste/drop handlers and the
  // "+" callback all read this so they see whatever editor exists right now,
  // even across remounts.
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
        // trailingNode.notAfter: don't auto-append an empty paragraph after a
        // list. StarterKit's TrailingNode adds one after any non-paragraph last
        // block, which read as an undeletable blank line when a vision ended on
        // bullets. We keep it after other blocks (images/headings) where it's a
        // useful "type here" affordance; Gapcursor still lets you type below a
        // list.
        StarterKit.configure({
          heading: { levels: [1, 2] },
          trailingNode: {
            notAfter: ['paragraph', 'bulletList', 'orderedList', 'taskList'],
          },
        }),
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

  return { editor, uploadAndInsert, uploadingCount };
}

/**
 * Insert one fresh guided-writing question at the caret, never repeating a
 * question already present in this document. Shared by both editors' "+ כתיבה
 * מודרכת" button.
 */
export function insertGuidedQuestion(editor: Editor, scope: VisionScope) {
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
}

// Pull `image/*` File entries out of a clipboard or drag event. Ignores any
// non-image payload so plain-text paste still goes through Tiptap's defaults.
function filesFrom(source: DataTransfer | null | undefined): File[] {
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

// Tiptap rejects empty objects; an empty document is `{ type: 'doc', content: [] }`.
// We normalise the various "empty" shapes the DB might hand us.
function normaliseContent(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length === 0) return null;
  return value;
}
