// ============================================================================
// Vision content helpers (no I/O).
// ============================================================================

/**
 * True when a Tiptap document has no user-written text — i.e. it's null, an
 * empty object, or contains only empty paragraphs / non-text nodes. Used to
 * decide whether to show the "written" check-mark next to a vision title.
 *
 * Only real typed text counts: an inserted guided-question block (whose text
 * lives in node attrs, not a text node) does NOT mark the entry as written.
 */
export function isVisionContentEmpty(content: unknown): boolean {
  if (!content || typeof content !== 'object') return true;
  let hasText = false;
  const walk = (node: unknown): void => {
    if (hasText || !node || typeof node !== 'object') return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === 'text' && typeof n.text === 'string' && n.text.trim()) {
      hasText = true;
      return;
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
        if (hasText) return;
      }
    }
  };
  walk(content);
  return !hasText;
}

/**
 * Flatten a Tiptap vision document to a short plain-text preview for the
 * free-scroll feed. Collects typed text, guided-question prompts, and a small
 * marker for images, then trims to `maxLen`.
 */
export function visionPreviewText(content: unknown, maxLen = 180): string {
  if (!content || typeof content !== 'object') return '';
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as {
      type?: string;
      text?: string;
      attrs?: { text?: unknown };
      content?: unknown[];
    };
    if (n.type === 'text' && typeof n.text === 'string') {
      parts.push(n.text);
    } else if (n.type === 'visionQuestion' && typeof n.attrs?.text === 'string') {
      parts.push(n.attrs.text);
    } else if (n.type === 'visionImage') {
      parts.push('🖼️');
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(content);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trimEnd()}…` : text;
}
