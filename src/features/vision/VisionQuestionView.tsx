// ============================================================================
// VisionQuestionView — React render layer for the VisionQuestion atom.
// ----------------------------------------------------------------------------
// Shows the question text in bold (notebook-prompt feel) flanked by three
// tiny actions:
//   ✎  edit the question text in place (updates this node's snapshot only —
//      the catalog is untouched; manage that from the settings sheet)
//   ↻  swap for a different question from the same scope
//   ✕  delete this question (and its trailing empty answer paragraph)
//
// We can't access the surrounding paragraph from a node view, so the delete
// button only removes the question itself. That's intentional — if the user
// has already started answering, their words stay; only the prompt vanishes.
// ============================================================================
import { useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { X, RefreshCw, Pencil, Check } from 'lucide-react';
import { pickQuestion } from './questions';
import type { VisionScope } from './period';

export function VisionQuestionView({
  node,
  editor,
  getPos,
}: NodeViewProps) {
  const scope = (node.attrs.scope as VisionScope) ?? 'yearly';
  const text = (node.attrs.text as string) ?? '';

  // In-place edit state. The draft lives locally; committing writes it back
  // onto the node's `text` attr (the per-entry snapshot).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleDelete = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null || pos === undefined) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(pos)
      .deleteSelection()
      .run();
  };

  const handleReplace = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null || pos === undefined) return;
    // Collect every other question id in the doc so the replacement avoids
    // repeats. We skip the current node so it can be re-used if the catalog
    // is exhausted (the user would see the same question briefly but with a
    // fresh randomisation — accepted tradeoff).
    const usedIds = new Set<string>();
    editor.state.doc.descendants((n, nodePos) => {
      if (n.type.name !== 'visionQuestion') return;
      if (nodePos === pos) return;
      const id = n.attrs?.questionId;
      if (typeof id === 'string' && id) usedIds.add(id);
    });
    const next = pickQuestion(scope, usedIds);
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, {
          questionId: next.id,
          scope,
          text: next.text,
        });
        return true;
      })
      .run();
  };

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
    // Focus after the textarea mounts; place the caret at the end.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const commitEdit = () => {
    const nextText = draft.trim();
    setEditing(false);
    if (!nextText || nextText === text) return;
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null || pos === undefined) return;
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: nextText });
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper
      // contentEditable=false on the wrapper keeps the cursor out of the
      // atom's text. The action buttons / textarea re-enable pointer events
      // for themselves below.
      as="div"
      className="vision-question group"
      dir="rtl"
      contentEditable={false}
    >
      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter commits (questions are one-liners); Esc cancels.
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
              e.stopPropagation();
            }}
            onBlur={commitEdit}
            rows={2}
            dir="rtl"
            className="vision-question__input"
            aria-label="עריכת השאלה"
          />
          <span className="vision-question__actions" style={{ opacity: 1 }}>
            <button
              type="button"
              // mousedown (not click) so it wins against the textarea blur.
              onMouseDown={(e) => {
                e.preventDefault();
                commitEdit();
              }}
              aria-label="שמור שאלה"
              title="שמור"
              className="vision-question__btn"
            >
              <Check size={14} />
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="vision-question__text">{text}</span>
          <span className="vision-question__actions">
            <button
              type="button"
              onClick={startEdit}
              aria-label="ערוך שאלה"
              title="ערוך"
              className="vision-question__btn"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={handleReplace}
              aria-label="שאלה אחרת"
              title="שאלה אחרת"
              className="vision-question__btn"
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="מחק שאלה"
              title="מחק"
              className="vision-question__btn"
            >
              <X size={14} />
            </button>
          </span>
        </>
      )}
    </NodeViewWrapper>
  );
}
