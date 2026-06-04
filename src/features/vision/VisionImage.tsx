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
// ============================================================================
import { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { ImageOff, Loader2 } from 'lucide-react';
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

export const VisionImage = Node.create({
  name: 'visionImage',
  group: 'block',
  atom: true,
  draggable: true,
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

function VisionImageView({ node, selected }: NodeViewProps) {
  const path = (node.attrs.path as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? '';
  const width = (node.attrs.width as number | null) ?? null;
  const height = (node.attrs.height as number | null) ?? null;

  // Show a cached URL synchronously on first render — no skeleton flash when
  // re-opening an entry whose images were just signed in a batch.
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

  // Preserve aspect-ratio of the resized image so the layout doesn't jump
  // between the skeleton and the loaded <img>. Falls back to a soft 4:3 box.
  const ratio = width && height ? `${width} / ${height}` : '4 / 3';

  return (
    <NodeViewWrapper
      as="div"
      className={`vision-image-block my-3 ${
        selected ? 'ring-2 ring-forest-500/70 rounded-2xl' : ''
      }`}
      data-drag-handle
    >
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-surface-raised"
        style={{ aspectRatio: ratio }}
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
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
            onError={() => setStatus('error')}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}
