// ============================================================================
// <Emoji /> — render an emoji as a hosted PNG/SVG image instead of letting
// the OS draw it. The OS-painted glyph for "🔥" looks wildly different on
// iOS 18, Android 8, Windows 10, etc.; serving a hosted asset locks the
// visual to one consistent set across every device the app runs on.
//
// Source:  Microsoft Fluent UI Emoji (the colorful 3D set).
//          MIT-licensed, free to use commercially.
// CDN:     emojicdn.elk.sh — a tiny redirector that takes an emoji char and
//          a style (here: "microsoft") and returns the appropriate Fluent
//          asset. Saves us from shipping a 1500-entry emoji → filename map.
//
// Replacing a `<span>{emoji}</span>` with `<Emoji emoji={emoji} size={…} />`
// is the only thing a caller has to change.
// ============================================================================

import type { CSSProperties } from 'react';

const EMOJI_STYLE = 'microsoft'; // Microsoft Fluent 3D
const EMOJI_CDN_BASE = 'https://emojicdn.elk.sh';

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
  // The CDN expects the emoji character itself in the path. encodeURIComponent
  // turns the multibyte glyph into URL-safe percent-encoding.
  const src = `${EMOJI_CDN_BASE}/${encodeURIComponent(emoji)}?style=${EMOJI_STYLE}`;
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
      // If the CDN can't serve this emoji for some reason, fall back to the
      // OS glyph so the user still sees *something* recognizable.
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
