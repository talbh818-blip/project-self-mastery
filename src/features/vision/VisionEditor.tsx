// ============================================================================
// VisionEditor — Tiptap rich-text surface for a single vision entry.
// ----------------------------------------------------------------------------
// The editor is uncontrolled: it receives an initial document on mount (and
// again when the period key changes) and owns its state from there. Every
// keystroke fires `onChange(json)` so the parent can debounce + persist.
//
// LAYOUT:
//   • DateBar (top of card): title + period stepper, icon picker, Assist
//     toggle, save status.
//   • EditorContent: the writing surface.
//   • VisionToolbar (fixed, rides above the keyboard): size / bold / italic /
//     underline / list / highlight / undo-redo.
//
// ASSIST MODE: the DateBar toggle reveals a "+ כתיבה מודרכת" button under the
// title. Questions are inserted ONLY on tap — there is no auto-seeding (it
// used to re-seed every empty week as you navigated, which was unwanted).
// The question catalog is admin-managed (vision_questions table); we kick off
// its fetch on mount so picks are fresh by the time the user taps.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
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
import { pickQuestion, ensureQuestionsLoaded } from './questions';
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
  /** The vision's display title (scope name + period range) for the DateBar. */
  title: string;
  /** Step the open period back / forward from the DateBar's chevrons. */
  onStepPeriod: (delta: number) => void;
  /** Whether the next period is reachable (not future). */
  canStepNext: boolean;
  /** "Back to current week" control, shown in the DateBar. Inactive when
   *  we're already on it. */
  jumpToNow: { label: string; enabled: boolean; onJump: () => void };
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
  title,
  onStepPeriod,
  canStepNext,
  jumpToNow,
  icon,
  onIconClick,
  onChange,
}: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Warm the guided-writing question catalog (DB-backed, falls back to the
  // built-in list until/unless the fetch lands). pickQuestion stays sync.
  useEffect(() => {
    void ensureQuestionsLoaded();
  }, []);
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

  // NOTE: Assist no longer auto-seeds questions. It used to drop a few starter
  // questions into any empty doc when on — but because the editor remounts on
  // every period change, navigating week→week with Assist on re-seeded each
  // empty week (unwanted). Questions are now added ONLY when the user taps the
  // "+ כתיבה מודרכת" button.

  if (!editor) {
    return (
      <div className="vision-editor vision-page">
        <DateBar
          title={title}
          onStepPeriod={onStepPeriod}
          canStepNext={canStepNext}
          jumpToNow={jumpToNow}
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
          title={title}
          onStepPeriod={onStepPeriod}
          canStepNext={canStepNext}
          jumpToNow={jumpToNow}
          assistOn={assistOn}
          onToggleAssist={toggleAssist}
          icon={icon}
          onIconClick={onIconClick}
          saveStatus={saveStatus}
        />
        {/* Guided-writing: insert another question. Sits right under the
            title (top of the writing card), not in the formatting toolbar.
            Always mounted while editable — the .assist-reveal shell slides
            it open/closed smoothly as the Assist toggle flips. */}
        {!readOnly && (
          <div
            className={`assist-reveal ${assistOn ? 'assist-reveal--open' : ''}`}
            aria-hidden={!assistOn}
          >
            <div className="assist-reveal__inner pb-2">
              <button
                type="button"
                tabIndex={assistOn ? 0 : -1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={insertOneQuestion}
                className="
                  w-full inline-flex items-center justify-center gap-1.5 h-9
                  rounded-xl border border-dashed border-surface-border
                  text-[13px] font-medium text-ink-300
                  hover:text-forest-400 hover:border-forest-600 hover:bg-forest-700/5
                  transition-colors
                "
              >
                <Plus size={15} strokeWidth={2.2} />
                כתיבה מודרכת
              </button>
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {!readOnly && (
        <ToolbarShell>
          <VisionToolbar
            editor={editor}
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
