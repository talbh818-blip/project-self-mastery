// ============================================================================
// VisionQuestion — custom Tiptap block node for an Assist question.
// ----------------------------------------------------------------------------
// The question itself is read-only chrome (an "atom" with no editable
// content): the human text + question id live in attrs, and the user's
// answer goes in the regular paragraph that follows. Atoms keep the cursor
// out of the question text so it can't accidentally be edited or split.
//
// Schema in jsonb:
//   { type: 'visionQuestion',
//     attrs: { questionId: 'y-vision', scope: 'yearly',
//              text: 'מה החזון שלי...' } }
//
// `text` is snapshot at insertion time so old entries stay readable even if
// the static catalog is rewritten later (catalog migration safety).
// ============================================================================
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VisionQuestionView } from './VisionQuestionView';
import type { VisionScope } from './period';

export type VisionQuestionAttrs = {
  questionId: string;
  scope: VisionScope;
  text: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    visionQuestion: {
      /** Insert a question block + an empty paragraph at the current selection. */
      insertVisionQuestion: (attrs: VisionQuestionAttrs) => ReturnType;
      /** Replace the question at `pos` with a different one. */
      replaceVisionQuestion: (pos: number, attrs: VisionQuestionAttrs) => ReturnType;
    };
  }
}

export const VisionQuestionNode = Node.create({
  name: 'visionQuestion',
  group: 'block',
  atom: true,
  selectable: false,
  // Block-level so it sits on its own line — never inline with regular text.

  addAttributes() {
    return {
      questionId: { default: '' },
      scope: { default: 'yearly' },
      text: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-vision-question]',
        getAttrs(el) {
          const dom = el as HTMLElement;
          return {
            questionId: dom.getAttribute('data-question-id') ?? '',
            scope: (dom.getAttribute('data-scope') ?? 'yearly') as VisionScope,
            text: dom.getAttribute('data-text') ?? dom.textContent ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-vision-question': '',
          'data-question-id': node.attrs.questionId,
          'data-scope': node.attrs.scope,
          'data-text': node.attrs.text,
          class: 'vision-question',
        },
        HTMLAttributes,
      ),
      node.attrs.text,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VisionQuestionView);
  },

  addCommands() {
    return {
      insertVisionQuestion:
        (attrs) =>
        ({ chain }) => {
          // Insert the question, then an empty paragraph below it that the
          // cursor lands in so the user can immediately start typing an
          // answer.
          return chain()
            .insertContent([
              { type: this.name, attrs },
              { type: 'paragraph' },
            ])
            .run();
        },

      replaceVisionQuestion:
        (pos, attrs) =>
        ({ chain }) => {
          return chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, attrs)
            .run();
        },
    };
  },
});
