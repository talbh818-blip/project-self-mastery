// ============================================================================
// <Emoji /> — render an emoji as a hosted PNG/SVG image instead of letting
// the OS draw it. The OS-painted glyph for "🔥" looks wildly different on
// iOS 18, Android 8, Windows 10, etc.; serving a hosted asset locks the
// visual to one consistent set across every device the app runs on.
//
// Source order:
//   1. Microsoft Fluent UI Emoji **3D** PNGs (the colorful 3D set), pulled
//      straight from the github.com/microsoft/fluentui-emoji repo via
//      jsDelivr. The mapping from emoji char → directory name lives in
//      fluent-emoji-map.ts (extend it there if you add new emojis).
//      MIT-licensed; free for commercial use.
//   2. Fallback: emojicdn.elk.sh with style=microsoft (the older flat
//      Segoe UI Emoji set) — used when the emoji isn't in our map.
//   3. Final fallback (onError): the OS glyph.
//
// Replacing a `<span>{emoji}</span>` with `<Emoji emoji={emoji} size={…} />`
// is the only thing a caller has to change.
// ============================================================================

import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import { fluent3dUrlFor } from './fluent-emoji-map';

const FALLBACK_CDN_BASE = 'https://emojicdn.elk.sh';
const FALLBACK_STYLE = 'microsoft';

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
  // Two-stage source: prefer Fluent 3D; if our map doesn't know this emoji,
  // OR if the 3D PNG fails to load (e.g., directory name mismatch), step
  // down to the emojicdn fallback. If even that fails, the final onError
  // swaps the <img> for a <span> with the OS glyph.
  const fluent3d = fluent3dUrlFor(emoji);
  const fallback = `${FALLBACK_CDN_BASE}/${encodeURIComponent(emoji)}?style=${FALLBACK_STYLE}`;
  const [src, setSrc] = useState<string>(fluent3d ?? fallback);
  const [triedFallback, setTriedFallback] = useState<boolean>(fluent3d == null);

  const handleError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (!triedFallback) {
      // Fluent 3D failed — try emojicdn microsoft next.
      setTriedFallback(true);
      setSrc(fallback);
      return;
    }
    // Both CDNs failed — fall back to the OS glyph so the user still sees
    // *something* recognizable.
    const img = e.currentTarget;
    const span = document.createElement('span');
    span.textContent = emoji;
    span.style.fontSize = `${size}px`;
    span.style.lineHeight = '1';
    span.style.display = 'inline-block';
    img.replaceWith(span);
  };

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
      onError={handleError}
    />
  );
}
