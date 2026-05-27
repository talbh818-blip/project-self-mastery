// ============================================================================
// <Emoji /> — render an emoji as a Twemoji SVG image instead of leaving it to
// the OS to draw. The OS-painted glyph for "🔥" looks wildly different on
// iOS 18, Android 8, Windows 10, etc.; using a hosted SVG locks the visual to
// one consistent set across every device the app runs on.
//
// Source:  jdecked/twemoji (the actively-maintained Twemoji fork)
// CDN:     jsDelivr — pinned to a specific version so cache stays warm and
//          the visual doesn't shift if upstream releases new assets.
//
// Replacing a `<span>{emoji}</span>` with `<Emoji emoji={emoji} size={…} />`
// is the only thing a caller has to change.
// ============================================================================

import type { CSSProperties } from 'react';

// Pin the Twemoji asset version so the rendered glyph never moves under us.
// Bump intentionally when we want updated artwork; do not use "latest".
const TWEMOJI_VERSION = '15.1.0';
const TWEMOJI_CDN_BASE =
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg`;

// Convert an emoji string to the dash-joined hex codepoint sequence Twemoji
// uses for filenames. Handles:
//   - surrogate pairs (codePointAt walks them correctly)
//   - ZWJ-joined emoji ("👨‍👩‍👧" → "1f468-200d-1f469-200d-1f467")
//   - the U+FE0F variation selector, which Twemoji strips from filenames
//     unless the base codepoint requires it. We strip it across the board —
//     that's what Twemoji's own parser does for the bulk of the catalog.
function toTwemojiCodepoint(emoji: string): string {
  const codepoints: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp === 0xfe0f) continue;
    codepoints.push(cp.toString(16));
  }
  return codepoints.join('-');
}

type EmojiProps = {
  /** The raw emoji character(s), e.g. "🔥", "✨", "👨‍👩‍👧". */
  emoji: string;
  /** Side length in pixels. Defaults to 20 to match a text-base line. */
  size?: number;
  /** Optional extra classes for the wrapper. */
  className?: string;
  /**
   * Accessible label. Defaults to the emoji itself (which screen readers
   * tend to announce sensibly). Pass an explicit label for decorative use
   * (e.g. `ariaLabel=""` to hide it from AT).
   */
  ariaLabel?: string;
  style?: CSSProperties;
};

export function Emoji({
  emoji,
  size = 20,
  className = '',
  ariaLabel,
  style,
}: EmojiProps) {
  const codepoint = toTwemojiCodepoint(emoji);
  const src = `${TWEMOJI_CDN_BASE}/${codepoint}.svg`;
  const decorative = ariaLabel === '';
  return (
    <img
      src={src}
      alt={decorative ? '' : ariaLabel ?? emoji}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      draggable={false}
      className={`inline-block align-[-0.15em] ${className}`}
      style={style}
      // If Twemoji doesn't have this codepoint for some reason, fall back to
      // the OS emoji so the user still sees *something* recognizable.
      onError={(e) => {
        const img = e.currentTarget;
        const fallback = document.createElement('span');
        fallback.textContent = emoji;
        fallback.style.fontSize = `${size}px`;
        fallback.style.lineHeight = '1';
        fallback.style.display = 'inline-block';
        img.replaceWith(fallback);
      }}
    />
  );
}
