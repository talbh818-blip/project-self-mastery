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

/**
 * Flatten a vision document into block-level LINES, preserving paragraph breaks
 * (unlike `visionPreviewText`, which joins everything with spaces). Headings and
 * paragraphs become one line each; list items become "• "-prefixed lines. Used
 * by the read-only "look back" panel so past visions read like the journal they
 * are, not one run-on blob.
 */
export function visionParagraphs(content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];

  const textOf = (node: unknown): string => {
    const parts: string[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      const nn = n as {
        type?: string;
        text?: string;
        attrs?: { text?: unknown };
        content?: unknown[];
      };
      if (nn.type === 'text' && typeof nn.text === 'string') parts.push(nn.text);
      else if (nn.type === 'visionQuestion' && typeof nn.attrs?.text === 'string')
        parts.push(nn.attrs.text);
      else if (nn.type === 'visionImage') parts.push('🖼️');
      if (Array.isArray(nn.content)) for (const c of nn.content) walk(c);
    };
    walk(node);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };

  const root = content as { content?: unknown[] };
  const blocks = Array.isArray(root.content) ? root.content : [];
  const lines: string[] = [];
  for (const block of blocks) {
    const b = block as { type?: string; content?: unknown[] };
    if (
      b.type === 'bulletList' ||
      b.type === 'orderedList' ||
      b.type === 'taskList'
    ) {
      const items = Array.isArray(b.content) ? b.content : [];
      for (const li of items) {
        const t = textOf(li);
        if (t) lines.push(`• ${t}`);
      }
    } else {
      const t = textOf(block);
      if (t) lines.push(t);
    }
  }
  return lines;
}
