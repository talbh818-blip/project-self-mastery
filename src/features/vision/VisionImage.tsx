// ============================================================================
// VisionImage — a Tiptap image node backed by a private storage path.
// ----------------------------------------------------------------------------
// Why not the stock `@tiptap/extension-image`? That node persists the raw
// `src` URL in the document JSON. Our images live in a PRIVATE bucket (see
// migration 0022) and are reached through short-lived signed URLs — embedding
// those URLs in the saved JSON would mean every entry slowly fills with dead
// links the moment a URL expires.
//
// Instead, the canonical identifier is `path` (e.g. `userId/uuid.jpg`). Only
// that gets saved. A React NodeView resolves the path to a signed URL at
// render time and shows the image. Freshly-uploaded images skip the round
// trip — the upload already returned a signed URL that we cached, so the
// NodeView reads it synchronously from the cache and renders with no flash.
//
// SELECTION CHROME (when the user taps the image):
//   • Top-right "X" → deletes the node.
//   • Bottom-left handle → drag to resize. Aspect ratio is locked by the
//     wrapper's aspect-ratio CSS, so dragging width auto-updates height. The
//     committed `displayWidth` (pixels) is persisted in the doc; null means
//     "fill the editor column".
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import { ImageOff, Loader2, MoveDiagonal2, X } from 'lucide-react';
import { getCachedSignedUrl, signVisionImage } from './storage';

export type SetVisionImageOptions = {
  path: string;
  alt?: string;
  width?: number;
  height?: number;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    visionImage: {
      setVisionImage: (options: SetVisionImageOptions) => ReturnType;
    };
  }
}

/** Minimum width the user can shrink an image to (px). Below this the handle
 *  is hard to grab and the image is unreadable. */
const MIN_DISPLAY_WIDTH = 120;

export const VisionImage = Node.create({
  name: 'visionImage',
  group: 'block',
  atom: true,
  // NOT draggable: with a NodeView that has its own pointer controls (resize
  // handle, delete button), ProseMirror's node-drag copied the node instead
  // of moving it — dropping it elsewhere left a duplicate behind. Resize +
  // delete cover the real needs; reordering isn't worth the duplication bug.
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      // Canonical storage path — the ONLY persistent identifier.
      path: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-path'),
        renderHTML: (attrs) =>
          attrs.path ? { 'data-path': attrs.path } : {},
      },
      alt: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('alt'),
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
      },
      // Natural pixel dimensions of the uploaded (post-resize) image — used
      // to lock the aspect-ratio of the display box so width-only drags
      // auto-compute height. Persisted alongside `path` so reloads don't
      // need to re-measure.
      width: {
        default: null as number | null,
        parseHTML: (el) => {
          const w = el.getAttribute('width');
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { width: String(attrs.width) } : {},
      },
      height: {
        default: null as number | null,
        parseHTML: (el) => {
          const h = el.getAttribute('height');
          return h ? Number(h) : null;
        },
        renderHTML: (attrs) =>
          attrs.height ? { height: String(attrs.height) } : {},
      },
      // User-controlled display width in CSS pixels. null → fill the editor
      // column (the default for fresh uploads).
      displayWidth: {
        default: null as number | null,
        parseHTML: (el) => {
          const w = el.getAttribute('data-display-width');
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) =>
          attrs.displayWidth
            ? { 'data-display-width': String(attrs.displayWidth) }
            : {},
      },
    };
  },

  parseHTML() {
    // Anything in the DOM tagged with data-path becomes a visionImage on
    // paste (e.g. copying from one entry to another).
    return [{ tag: 'img[data-path]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // No `src` here — without a signed URL, the raw <img> would 404. The
    // NodeView is what actually shows the image; this branch only runs in
    // headless contexts (server render, copy-to-HTML), where the data-path
    // is enough to reconstruct the node on paste.
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VisionImageView);
  },

  // When the image node itself is selected and the user starts typing,
  // ProseMirror would by default REPLACE the atom with the typed text —
  // silently deleting the picture. Instead, redirect the input to just AFTER
  // the image (creating a paragraph if there's no textblock there yet) so the
  // caret flows on past the image the way Google Docs does.
  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        props: {
          handleTextInput(view, _from, _to, text) {
            const { state } = view;
            const sel = state.selection;
            if (!(sel instanceof NodeSelection) || sel.node.type !== type) {
              return false;
            }
            const insertPos = sel.to; // position right after the image
            let tr = state.tr;
            const nodeAfter = tr.doc.resolve(insertPos).nodeAfter;
            if (nodeAfter && nodeAfter.isTextblock) {
              const inPos = insertPos + 1; // step inside the textblock
              tr = tr
                .insertText(text, inPos)
                .setSelection(
                  TextSelection.create(tr.doc, inPos + text.length),
                );
            } else {
              const paragraph = state.schema.nodes.paragraph;
              if (!paragraph) return false;
              tr = tr
                .insert(
                  insertPos,
                  paragraph.create(null, state.schema.text(text)),
                )
                .setSelection(
                  TextSelection.create(tr.doc, insertPos + 1 + text.length),
                );
            }
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setVisionImage:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: options,
          }),
    };
  },
});

// ─── NodeView ───────────────────────────────────────────────────────────────

function VisionImageView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const path = (node.attrs.path as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? '';
  const naturalWidth = (node.attrs.width as number | null) ?? null;
  const naturalHeight = (node.attrs.height as number | null) ?? null;
  const persistedDisplayWidth =
    (node.attrs.displayWidth as number | null) ?? null;

  // Signed URL — cached on first paint to skip the skeleton when re-opening
  // an entry whose images were just signed in a batch.
  const initialCached = path ? getCachedSignedUrl(path) : null;
  const [url, setUrl] = useState<string | null>(initialCached);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(
    initialCached ? 'idle' : path ? 'loading' : 'error',
  );

  useEffect(() => {
    if (!path) {
      setStatus('error');
      return;
    }
    const cached = getCachedSignedUrl(path);
    if (cached) {
      setUrl(cached);
      setStatus('idle');
      return;
    }
    let alive = true;
    setStatus('loading');
    signVisionImage(path)
      .then((signedUrl) => {
        if (!alive) return;
        setUrl(signedUrl);
        setStatus('idle');
      })
      .catch(() => {
        if (!alive) return;
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [path]);

  // ── Resize drag ───────────────────────────────────────────────────────────
  // During an active drag we drive the box width from `dragWidth` (local
  // state, no doc churn). On pointer up we commit the final value to the
  // node's `displayWidth` attribute → it's saved with the rest of the doc.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
    /** Pointer capture target — released on pointer up. */
    pointerId: number;
    element: HTMLElement;
  } | null>(null);

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only primary-button drags. Right-click etc. shouldn't start a resize.
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const container = containerRef.current;
      if (!container) return;
      e.preventDefault();
      e.stopPropagation();
      const currentWidth =
        persistedDisplayWidth ?? container.getBoundingClientRect().width;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      dragStateRef.current = {
        startX: e.clientX,
        startWidth: currentWidth,
        pointerId: e.pointerId,
        element: target,
      };
      setDragWidth(currentWidth);
    },
    [persistedDisplayWidth],
  );

  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragStateRef.current;
      if (!s) return;
      e.preventDefault();
      // The handle lives at the BOTTOM-LEFT of the image (visual). Dragging
      // it LEFT (clientX decreasing) should GROW the image. So delta is the
      // negative of the raw cursor delta — flipped for RTL ergonomics.
      const delta = s.startX - e.clientX;
      const editorWidth =
        containerRef.current?.parentElement?.getBoundingClientRect().width ??
        Number.POSITIVE_INFINITY;
      const max = Math.min(naturalWidth ?? editorWidth, editorWidth);
      const next = Math.max(
        MIN_DISPLAY_WIDTH,
        Math.min(max, s.startWidth + delta),
      );
      setDragWidth(next);
    },
    [naturalWidth],
  );

  const endResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragStateRef.current;
      if (!s) return;
      try {
        s.element.releasePointerCapture(s.pointerId);
      } catch {
        // Some browsers throw if the capture was already lost (e.g. element
        // unmounted mid-drag); the drag has ended either way.
      }
      dragStateRef.current = null;
      const finalWidth = dragWidth;
      setDragWidth(null);
      if (finalWidth != null) {
        // Round to an integer — sub-pixel widths bloat the doc JSON for no
        // visual gain.
        updateAttributes({ displayWidth: Math.round(finalWidth) });
      }
      e.preventDefault();
    },
    [dragWidth, updateAttributes],
  );

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // `deleteNode` (provided by ReactNodeViewRenderer) removes THIS node
      // and is safer than dispatching a range delete by hand — it knows the
      // node's current position even after intervening edits.
      deleteNode();
    },
    [deleteNode],
  );

  // ── Selection on tap ─────────────────────────────────────────────────────
  // Atoms get auto-selected on click only when the editor is editable AND
  // the pointer hits ProseMirror's own listener. Tapping the wrapper used
  // to fall through to the parent — selecting nothing. Force the selection
  // ourselves so the delete + resize chrome can appear on the first tap.
  const handleSelectClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Ignore clicks that came from the controls themselves.
      const target = e.target as HTMLElement;
      if (target.closest('[data-vision-image-control]')) return;
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (pos == null) return;
      editor.chain().focus().setNodeSelection(pos).run();
    },
    [editor, getPos],
  );

  // Preserve aspect ratio so width-only drags update height. Falls back to a
  // soft 4:3 box while the image is still loading and we don't know its real
  // dimensions.
  const ratio =
    naturalWidth && naturalHeight ? `${naturalWidth} / ${naturalHeight}` : '4 / 3';

  // Live width: drag wins → persisted attr → fill the column.
  const effectiveWidth = dragWidth ?? persistedDisplayWidth ?? null;
  const wrapperStyle: React.CSSProperties = effectiveWidth
    ? { width: `${effectiveWidth}px`, maxWidth: '100%' }
    : { width: '100%' };

  return (
    <NodeViewWrapper
      as="div"
      className={`vision-image-block my-3 ${selected ? 'is-selected' : ''}`}
    >
      <div
        ref={containerRef}
        onClick={handleSelectClick}
        // Block any native HTML5 drag (image or node-selection) — that's what
        // was leaving a duplicate behind. Resize/delete are pointer-based and
        // unaffected.
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        className={`relative overflow-hidden rounded-2xl bg-surface-raised transition-shadow ${
          selected ? 'ring-2 ring-forest-500/70' : ''
        }`}
        style={{ ...wrapperStyle, aspectRatio: ratio }}
      >
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-300/60">
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-300/60 text-xs">
            <ImageOff size={22} />
            <span>התמונה לא נטענה</span>
          </div>
        )}
        {url && (
          <img
            src={url}
            alt={alt}
            // decoding=async: never block the main thread on image decode —
            // important on phones where a 1280px JPEG can take ~30ms to
            // decode. loading=lazy: skip work for images below the fold;
            // above-fold images still load immediately per the spec.
            decoding="async"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
            onError={() => setStatus('error')}
          />
        )}

        {/* Selection chrome — only when the node is selected AND the editor
            is editable. Read-only contexts (future preview screens) shouldn't
            show edit controls. */}
        {selected && editor.isEditable && (
          <>
            {/* Delete (X) — top-right physical corner. */}
            <button
              type="button"
              data-vision-image-control
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDelete}
              aria-label="מחק תמונה"
              className="
                absolute top-2 right-2 z-10 w-8 h-8 rounded-full
                bg-black/60 text-cream-50 backdrop-blur
                flex items-center justify-center
                hover:bg-black/80 transition
              "
            >
              <X size={16} strokeWidth={2.5} />
            </button>

            {/* Resize handle — bottom-left physical corner. A circular
                control (mirrors the delete button) carrying a diagonal
                resize glyph so its purpose is unmistakable. */}
            <div
              data-vision-image-control
              onPointerDown={startResize}
              onPointerMove={onResizeMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              role="slider"
              aria-label="גודל תמונה"
              aria-valuemin={MIN_DISPLAY_WIDTH}
              aria-valuemax={naturalWidth ?? undefined}
              aria-valuenow={effectiveWidth ?? undefined}
              className="
                absolute bottom-2 left-2 z-10 w-8 h-8 rounded-full
                bg-black/60 text-cream-50 backdrop-blur
                flex items-center justify-center
                hover:bg-black/80 transition
                cursor-nesw-resize touch-none
              "
            >
              <MoveDiagonal2 size={16} strokeWidth={2.5} />
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
