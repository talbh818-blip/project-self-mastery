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
