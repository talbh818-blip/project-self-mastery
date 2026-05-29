// ============================================================================
// VisionQuestionView — React render layer for the VisionQuestion atom.
// ----------------------------------------------------------------------------
// Shows the question text in bold (notebook-prompt feel) flanked by two
// tiny actions:
//   ✕  delete this question (and its trailing empty answer paragraph)
//   ↻  swap for a different question from the same scope
//
// We can't access the surrounding paragraph from a node view, so the delete
// button only removes the question itself. That's intentional — if the user
// has already started answering, their words stay; only the prompt vanishes.
// ============================================================================
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { X, RefreshCw } from 'lucide-react';
import { pickQuestion } from './questions';
import type { VisionScope } from './period';

export function VisionQuestionView({
  node,
  editor,
  getPos,
}: NodeViewProps) {
  const scope = (node.attrs.scope as VisionScope) ?? 'yearly';
  const text = (node.attrs.text as string) ?? '';

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

  return (
    <NodeViewWrapper
      // contentEditable=false on the wrapper keeps the cursor out of the
      // atom's text. The two action buttons re-enable pointer events for
      // themselves below.
      as="div"
      className="vision-question group"
      dir="rtl"
      contentEditable={false}
    >
      <span className="vision-question__text">{text}</span>
      <span className="vision-question__actions">
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
    </NodeViewWrapper>
  );
}
