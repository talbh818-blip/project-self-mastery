// ============================================================================
// Maps an emoji character → the directory name Microsoft Fluent UI Emoji uses
// for that emoji in github.com/microsoft/fluentui-emoji.
//
// File structure inside that repo for each entry:
//   assets/<Directory Name>/3D/<directory_name_lowercased_with_underscores>_3d.png
//   assets/<Directory Name>/Color/<…>_color.svg
//
// Example for "🔥":
//   directory: "Fire"
//   3D PNG:    "fire_3d.png"
//   URL path:  /assets/Fire/3D/fire_3d.png
//
// To extend: add the emoji char as the key and the exact directory name
// (case-sensitive, with spaces) as the value. Filename is computed.
// ============================================================================

export const EMOJI_TO_FLUENT_NAME: Record<string, string> = {
  // ---- Special / standalone emojis used outside the habit picker ----
  '🔥': 'Fire',
  '✨': 'Sparkles',
  '🎉': 'Party popper',
  '🌱': 'Seedling',
  // Note the LOWERCASE "europe" — that's how the directory is actually named
  // in microsoft/fluentui-emoji. With "Europe-Africa" the CDN returns 403 and
  // every render falls back to emojicdn, adding ~0.5–1s of perceived delay.
  '🌍': 'Globe showing europe-africa',
  '🌲': 'Evergreen tree',
  '🌳': 'Deciduous tree',
  '🌟': 'Glowing star',
  '⭐': 'Star',

  // ---- POSITIVE habit picker emojis ----
  // Fitness & body
  '🏃': 'Person running',
  '🚴': 'Person biking',
  '🏋️': 'Person lifting weights',
  '🧘': 'Person in lotus position',
  '🤸': 'Person cartwheeling',
  '🥊': 'Boxing glove',
  '⚽': 'Soccer ball',
  '🏀': 'Basketball',
  '🏊': 'Person swimming',
  '🚶': 'Person walking',
  '💪': 'Flexed biceps',
  // Healthy food
  '🍎': 'Red apple',
  '🥗': 'Green salad',
  '🥦': 'Broccoli',
  '🥕': 'Carrot',
  '🍓': 'Strawberry',
  '🥑': 'Avocado',
  '🍌': 'Banana',
  '🥚': 'Egg',
  '🍞': 'Bread',
  '🥛': 'Glass of milk',
  // Healthy drinks
  '💧': 'Droplet',
  '☕': 'Hot beverage',
  '🍵': 'Teacup without handle',
  '🧋': 'Bubble tea',
  '🥤': 'Cup with straw',
  // Sleep / wellness
  '😴': 'Sleeping face',
  '🛏️': 'Bed',
  '🌙': 'Crescent moon',
  '☀️': 'Sun',
  '🌅': 'Sunrise',
  '🧠': 'Brain',
  '💭': 'Thought balloon',
  '🕯️': 'Candle',
  '🌿': 'Herb',
  // Books / learning
  '📚': 'Books',
  '📖': 'Open book',
  '📝': 'Memo',
  '✏️': 'Pencil',
  '🎓': 'Graduation cap',
  '💡': 'Light bulb',
  '📊': 'Bar chart',
  // Productivity
  '💼': 'Briefcase',
  '📅': 'Calendar',
  '⏰': 'Alarm clock',
  '⏱️': 'Stopwatch',
  '✅': 'Check mark button',
  '🎯': 'Bullseye',
  '🗒️': 'Spiral notepad',
  // Money (saving)
  '💰': 'Money bag',
  '💵': 'Dollar banknote',
  '🏦': 'Bank',
  // Music & creative
  '🎵': 'Musical note',
  '🎶': 'Musical notes',
  '🎸': 'Guitar',
  '🎹': 'Musical keyboard',
  '🎨': 'Artist palette',
  '📷': 'Camera',
  '🎬': 'Clapper board',
  // Achievement
  '🏆': 'Trophy',
  '🥇': '1st place medal',
  '🥈': '2nd place medal',
  '🥉': '3rd place medal',
  '🏅': 'Sports medal',
  '🎖️': 'Military medal',
  '🚀': 'Rocket',
  '🌈': 'Rainbow',
  // Spiritual / mindset
  '❤️': 'Red heart',
  '🙏': 'Folded hands',
  '💖': 'Sparkling heart',
  '🌸': 'Cherry blossom',
  '🦋': 'Butterfly',
  // Nature
  '🌻': 'Sunflower',
  '🌊': 'Water wave',
  '🏔️': 'Snow-capped mountain',
  '🐦': 'Bird',
  '🐶': 'Dog face',

  // ---- NEGATIVE habit picker emojis ----
  // Substances
  '🚬': 'Cigarette',
  '🍺': 'Beer mug',
  '🍷': 'Wine glass',
  '🍸': 'Cocktail glass',
  '🥃': 'Tumbler glass',
  '🥂': 'Clinking glasses',
  // Junk food
  '🍕': 'Pizza',
  '🍔': 'Hamburger',
  '🍟': 'French fries',
  '🌭': 'Hot dog',
  '🍿': 'Popcorn',
  '🍩': 'Doughnut',
  '🍰': 'Shortcake',
  '🍫': 'Chocolate bar',
  '🍭': 'Lollipop',
  '🍪': 'Cookie',
  // Screens / games
  '📱': 'Mobile phone',
  '📺': 'Television',
  '🎮': 'Video game',
  '💻': 'Laptop',
  '⌨️': 'Keyboard',
  // Money waste
  '💸': 'Money with wings',
  '🛍️': 'Shopping bags',
  '💳': 'Credit card',
  // Gambling
  '🎰': 'Slot machine',
  '🎲': 'Game die',
  // Lazy / oversleeping
  '🛋️': 'Couch and lamp',
  // Negative emotions
  '😡': 'Pouting face',
  '🤬': 'Face with symbols on mouth',
  '😤': 'Face with steam from nose',
  // Generic warnings
  '⛔': 'No entry',
  '🚫': 'Prohibited',
  '❌': 'Cross mark',
  '⚠️': 'Warning',
  '💀': 'Skull',
};

/**
 * Build the jsDelivr URL for an emoji's Microsoft Fluent 3D PNG.
 * Returns null if the emoji isn't in our map (caller should fall back to
 * a different CDN or to the OS glyph).
 */
export function fluent3dUrlFor(emoji: string): string | null {
  // Try the emoji as-is; some emojis include the U+FE0F variation selector
  // which our keys above don't (e.g., '❤️' is stored as '❤' + FE0F).
  // We match both forms to be safe.
  const name =
    EMOJI_TO_FLUENT_NAME[emoji] ??
    EMOJI_TO_FLUENT_NAME[emoji.replace(/️/g, '')];
  if (!name) return null;

  // Directory name preserves spaces/case for the URL path; the filename is
  // lowercased, spaces → underscores.
  const dir = encodeURIComponent(name);
  const filename = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '_'));
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${dir}/3D/${filename}_3d.png`;
}
