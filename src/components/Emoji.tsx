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

// Module-level memo of image URLs that have already decoded at least once.
// Lets re-mounts (e.g. re-opening the picker) paint instantly instead of
// fading in again — and is the main thing that kills the perceived flicker.
const LOADED_SRCS = new Set<string>();

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
  const primary = fluent3d ?? fallback;
  const [src, setSrc] = useState<string>(primary);
  const [triedFallback, setTriedFallback] = useState<boolean>(fluent3d == null);
  // Fade the image in on first decode; if it's already been decoded once
  // (cached in LOADED_SRCS) start fully opaque so there's no re-fade flicker.
  const [loaded, setLoaded] = useState<boolean>(() => LOADED_SRCS.has(primary));

  // Reset the source chain when the `emoji` prop changes. <Emoji> instances
  // are reused across icon swaps (same position in the tree), and useState
  // only seeds on mount — so without this, replacing one emoji with another
  // kept rendering the OLD image until the component happened to unmount.
  // This is React's "adjust state during render" pattern: it re-renders
  // immediately with the right src, no flash and no post-paint effect lag.
  const [shownFor, setShownFor] = useState<string>(emoji);
  if (shownFor !== emoji) {
    setShownFor(emoji);
    setSrc(primary);
    setTriedFallback(fluent3d == null);
    setLoaded(LOADED_SRCS.has(primary));
  }

  const handleError = (e: SyntheticEvent<HTMLImageElement>) => {
    if (!triedFallback) {
      // Fluent 3D failed — try emojicdn microsoft next.
      setTriedFallback(true);
      setSrc(fallback);
      setLoaded(LOADED_SRCS.has(fallback));
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

  const handleLoad = () => {
    LOADED_SRCS.add(src);
    setLoaded(true);
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
      loading="lazy"
      decoding="async"
      className={`inline-block align-[-0.15em] ${className}`}
      style={{
        ...style,
        opacity: loaded ? 1 : 0,
        transition: 'opacity 160ms ease-out',
      }}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
