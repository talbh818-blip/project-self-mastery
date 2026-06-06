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
  // ---- Vision-themed emojis (used by the vision icon picker) ----
  // Directory names verified against microsoft/fluentui-emoji (all 200).
  // (🦋 🌊 🌌 📈 already exist further down — not re-added here.)
  '👑': 'Crown',
  '💎': 'Gem stone',
  '🦅': 'Eagle',
  '🕊️': 'Dove',
  '⚡': 'High voltage',
  '💯': 'Hundred points',
  '🔑': 'Key',
  '🗝️': 'Old key',
  '🏹': 'Bow and arrow',
  '⚓': 'Anchor',
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
  '🧗': 'Person climbing',
  '🏌️': 'Person golfing',
  '🏄': 'Person surfing',
  '🚣': 'Person rowing boat',
  '🤽': 'Person playing water polo',
  '🥋': 'Martial arts uniform',
  '🏐': 'Volleyball',
  '🎾': 'Tennis',
  '🎳': 'Bowling',
  '🛹': 'Skateboard',
  '🛼': 'Roller skate',
  '⛸️': 'Ice skate',
  '🎿': 'Skis',
  '🏂': 'Snowboarder',
  '🤿': 'Diving mask',
  '🥏': 'Flying disc',
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
  '🥬': 'Leafy green',
  '🌽': 'Ear of corn',
  '🥒': 'Cucumber',
  '🫐': 'Blueberries',
  '🍇': 'Grapes',
  '🍊': 'Tangerine',
  '🍋': 'Lemon',
  '🍐': 'Pear',
  '🍒': 'Cherries',
  '🍅': 'Tomato',
  '🐟': 'Fish',
  '🍳': 'Cooking',
  '🥜': 'Peanuts',
  '🌶️': 'Hot pepper',
  '🫑': 'Bell pepper',
  // Healthy drinks
  '💧': 'Droplet',
  '☕': 'Hot beverage',
  '🍵': 'Teacup without handle',
  '🧋': 'Bubble tea',
  '🥤': 'Cup with straw',
  '🧉': 'Mate',
  // Sleep / wellness
  '😴': 'Sleeping face',
  '🛏️': 'Bed',
  '🌙': 'Crescent moon',
  '☀️': 'Sun',
  '🌅': 'Sunrise',
  '🌄': 'Sunrise over mountains',
  '🧠': 'Brain',
  '💭': 'Thought balloon',
  '🕯️': 'Candle',
  '🌿': 'Herb',
  '🛁': 'Bathtub',
  '🚿': 'Shower',
  '🪥': 'Toothbrush',
  '🧼': 'Soap',
  '🧴': 'Lotion bottle',
  '🪒': 'Razor',
  // Health / medical
  '💊': 'Pill',
  '🩺': 'Stethoscope',
  '🦷': 'Tooth',
  '🧬': 'Dna',
  '🫀': 'Anatomical heart',
  '🫁': 'Lungs',
  // Books / learning
  '📚': 'Books',
  '📖': 'Open book',
  '📝': 'Memo',
  '✏️': 'Pencil',
  '🎓': 'Graduation cap',
  '💡': 'Light bulb',
  '📊': 'Bar chart',
  '📰': 'Newspaper',
  '📜': 'Scroll',
  '🖊️': 'Pen',
  '🔖': 'Bookmark',
  '📑': 'Bookmark tabs',
  '📒': 'Ledger',
  // Productivity
  '💼': 'Briefcase',
  '📅': 'Calendar',
  '⏰': 'Alarm clock',
  '⏱️': 'Stopwatch',
  '✅': 'Check mark button',
  '🎯': 'Bullseye',
  '🗒️': 'Spiral notepad',
  '📌': 'Pushpin',
  '📍': 'Round pushpin',
  '📎': 'Paperclip',
  '🗓️': 'Spiral calendar',
  '🧭': 'Compass',
  // Money (saving)
  '💰': 'Money bag',
  '💵': 'Dollar banknote',
  '🪙': 'Coin',
  '💴': 'Yen banknote',
  '💶': 'Euro banknote',
  '💷': 'Pound banknote',
  '🏦': 'Bank',
  '📈': 'Chart increasing',
  '💱': 'Currency exchange',
  // Music & creative
  '🎵': 'Musical note',
  '🎶': 'Musical notes',
  '🎸': 'Guitar',
  '🎹': 'Musical keyboard',
  '🎨': 'Artist palette',
  '📷': 'Camera',
  '🎬': 'Clapper board',
  '🎥': 'Movie camera',
  '📹': 'Video camera',
  '🎤': 'Microphone',
  '🎧': 'Headphone',
  '🎻': 'Violin',
  '🥁': 'Drum',
  '🎺': 'Trumpet',
  '🎷': 'Saxophone',
  '🖌️': 'Paintbrush',
  '🖼️': 'Framed picture',
  '🧵': 'Thread',
  '🧶': 'Yarn',
  '✂️': 'Scissors',
  '📐': 'Triangular ruler',
  '📏': 'Straight ruler',
  '🛠️': 'Hammer and wrench',
  '🔧': 'Wrench',
  '🔨': 'Hammer',
  '⚙️': 'Gear',
  '⛏️': 'Pick',
  '🪛': 'Screwdriver',
  // Tech / work
  '🖥️': 'Desktop computer',
  '🖱️': 'Computer mouse',
  '💾': 'Floppy disk',
  '📡': 'Satellite antenna',
  // Travel / movement
  '✈️': 'Airplane',
  '🚆': 'Train',
  '🚇': 'Metro',
  '🚗': 'Automobile',
  '🚙': 'Sport utility vehicle',
  '🚌': 'Bus',
  '🛴': 'Kick scooter',
  '⛵': 'Sailboat',
  '🛶': 'Canoe',
  '🚢': 'Ship',
  '🗺️': 'World map',
  '🧳': 'Luggage',
  // Family / care
  '👶': 'Baby',
  '👨‍👩‍👧': 'Family man woman girl',
  '🤱': 'Breast-feeding',
  '👨‍👩‍👦': 'Family man woman boy',
  // Communication
  '🗣️': 'Speaking head',
  '💬': 'Speech balloon',
  '📣': 'Megaphone',
  '🔔': 'Bell',
  '✉️': 'Envelope',
  '📧': 'E-mail',
  '🤝': 'Handshake',
  '🤗': 'Smiling face with open hands',
  // Achievement
  '🏆': 'Trophy',
  '🥇': '1st place medal',
  '🥈': '2nd place medal',
  '🥉': '3rd place medal',
  '🏅': 'Sports medal',
  '🎖️': 'Military medal',
  '🚀': 'Rocket',
  '🌈': 'Rainbow',
  '🎁': 'Wrapped gift',
  '🎀': 'Ribbon',
  '🏁': 'Chequered flag',
  '🚩': 'Triangular flag',
  '🎗️': 'Reminder ribbon',
  // Spiritual / mindset
  '❤️': 'Red heart',
  '🙏': 'Folded hands',
  '💖': 'Sparkling heart',
  '🌸': 'Cherry blossom',
  '🦋': 'Butterfly',
  '🕉️': 'Om',
  '☮️': 'Peace symbol',
  '☯️': 'Yin yang',
  '✡️': 'Star of david',
  '☪️': 'Star and crescent',
  '☸️': 'Wheel of dharma',
  '🛐': 'Place of worship',
  '⛪': 'Church',
  '🕍': 'Synagogue',
  '🕌': 'Mosque',
  '🛕': 'Hindu temple',
  // Eyes / awareness
  '👁️': 'Eye',
  '👀': 'Eyes',
  // Nature
  '🌻': 'Sunflower',
  '🌷': 'Tulip',
  '🌹': 'Rose',
  '🌺': 'Hibiscus',
  '🌼': 'Blossom',
  '🪷': 'Lotus',
  '🌾': 'Sheaf of rice',
  '🌵': 'Cactus',
  '🌴': 'Palm tree',
  '🪴': 'Potted plant',
  '🍀': 'Four leaf clover',
  '🍃': 'Leaf fluttering in wind',
  '🍂': 'Fallen leaf',
  '🍁': 'Maple leaf',
  '🌊': 'Water wave',
  '🏔️': 'Snow-capped mountain',
  '⛰️': 'Mountain',
  '🏝️': 'Desert island',
  '🏖️': 'Beach with umbrella',
  // Weather
  '☁️': 'Cloud',
  '⛅': 'Sun behind cloud',
  '🌧️': 'Cloud with rain',
  '⛄': 'Snowman without snow',
  '❄️': 'Snowflake',
  '🌪️': 'Tornado',
  // Stars / space
  '💫': 'Dizzy',
  '☄️': 'Comet',
  '🌠': 'Shooting star',
  '🌌': 'Milky way',
  '🪐': 'Ringed planet',
  // Animals
  '🐦': 'Bird',
  '🐶': 'Dog face',
  '🐱': 'Cat face',
  '🐰': 'Rabbit face',
  '🦊': 'Fox',
  '🐻': 'Bear',
  '🐨': 'Koala',
  '🐼': 'Panda',
  '🐯': 'Tiger face',
  '🦁': 'Lion',
  '🐢': 'Turtle',
  '🦉': 'Owl',
  '🐝': 'Honeybee',
  '🐬': 'Dolphin',
  '🐳': 'Spouting whale',
  // Positive emotions
  '🤩': 'Star-struck',
  '😊': 'Smiling face with smiling eyes',
  '😃': 'Grinning face with big eyes',
  '😄': 'Grinning face with smiling eyes',
  '😁': 'Beaming face with smiling eyes',
  '🥰': 'Smiling face with hearts',
  '😎': 'Smiling face with sunglasses',
  '🤔': 'Thinking face',
  '😌': 'Relieved face',
  '🥳': 'Partying face',

  // ---- NEGATIVE habit picker emojis ----
  // Substances
  '🚬': 'Cigarette',
  '🍺': 'Beer mug',
  '🍷': 'Wine glass',
  '🍸': 'Cocktail glass',
  '🥃': 'Tumbler glass',
  '🥂': 'Clinking glasses',
  '🍾': 'Bottle with popping cork',
  '💉': 'Syringe',
  '🧪': 'Test tube',
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
  '🍦': 'Soft ice cream',
  '🍨': 'Ice cream',
  '🧁': 'Cupcake',
  '🥓': 'Bacon',
  // Screens / games
  '📱': 'Mobile phone',
  '📺': 'Television',
  '🎮': 'Video game',
  '💻': 'Laptop',
  '⌨️': 'Keyboard',
  '📞': 'Telephone receiver',
  // Money waste
  '💸': 'Money with wings',
  '🛍️': 'Shopping bags',
  '💳': 'Credit card',
  '📉': 'Chart decreasing',
  // Gambling
  '🎰': 'Slot machine',
  '🎲': 'Game die',
  '🃏': 'Joker',
  // Lazy / oversleeping
  '🛋️': 'Couch and lamp',
  '🥱': 'Yawning face',
  '😪': 'Sleepy face',
  '⏳': 'Hourglass not done',
  '⌛': 'Hourglass done',
  // Negative emotions
  '😡': 'Pouting face',
  '🤬': 'Face with symbols on mouth',
  '😤': 'Face with steam from nose',
  '🤥': 'Lying face',
  '😈': 'Smiling face with horns',
  '👿': 'Angry face with horns',
  '🙄': 'Face with rolling eyes',
  '😒': 'Unamused face',
  '😞': 'Disappointed face',
  '😟': 'Worried face',
  '😣': 'Persevering face',
  '😭': 'Loudly crying face',
  '😢': 'Crying face',
  '💔': 'Broken heart',
  // Generic warnings
  '⛔': 'No entry',
  '🚫': 'Prohibited',
  '❌': 'Cross mark',
  '⚠️': 'Warning',
  '💀': 'Skull',
  '☠️': 'Skull and crossbones',
  '🔞': 'No one under eighteen',
  '🚭': 'No smoking',
  '🚯': 'No littering',
};

// ============================================================================
// Skin tones
// ============================================================================
// A subset of emojis (people / body parts) have skin-tone variants. In the
// Fluent repo these live under a per-tone subfolder with a tone suffix on the
// filename, e.g.:
//   assets/Flexed biceps/Default/3D/flexed_biceps_3d_default.png
//   assets/Flexed biceps/Dark/3D/flexed_biceps_3d_dark.png
// (whereas a non-tonable emoji like Fire is just assets/Fire/3D/fire_3d.png).
//
// IMPORTANT: requesting the non-tonable path for a tonable emoji returns 403,
// which is exactly what made all the person emojis flicker (every render fell
// through to the slower fallback CDN). Routing them to the correct tonable
// path fixes both the flicker AND unlocks the tone picker.

export type SkinToneKey =
  | 'default'
  | 'light'
  | 'medium-light'
  | 'medium'
  | 'medium-dark'
  | 'dark';

/** Tone metadata for the picker. `swatch` is a representative skin color. */
export const SKIN_TONES: ReadonlyArray<{
  key: SkinToneKey;
  modifier: string;
  swatch: string;
  label: string;
}> = [
  { key: 'default', modifier: '', swatch: '#FCD24B', label: 'ברירת מחדל' },
  { key: 'light', modifier: '\u{1F3FB}', swatch: '#F4D9C6', label: 'בהיר' },
  { key: 'medium-light', modifier: '\u{1F3FC}', swatch: '#E2BC93', label: 'בהיר-בינוני' },
  { key: 'medium', modifier: '\u{1F3FD}', swatch: '#C79C6B', label: 'בינוני' },
  { key: 'medium-dark', modifier: '\u{1F3FE}', swatch: '#9A6A41', label: 'כהה-בינוני' },
  { key: 'dark', modifier: '\u{1F3FF}', swatch: '#5C4434', label: 'כהה' },
];

const MODIFIER_TO_TONE: Record<string, SkinToneKey> = {
  '\u{1F3FB}': 'light',
  '\u{1F3FC}': 'medium-light',
  '\u{1F3FD}': 'medium',
  '\u{1F3FE}': 'medium-dark',
  '\u{1F3FF}': 'dark',
};
const ALL_MODIFIERS = Object.keys(MODIFIER_TO_TONE);

// Base emojis (FE0F + tone stripped) that have Fluent skin-tone variants.
const TONABLE = new Set<string>([
  '🏃', '🚴', '🏋', '🧘', '🤸', '🏊', '🚶', '💪', '🧗', '🏌', '🏄', '🚣',
  '🤽', '👶', '🙏',
]);

// Normalised lookup: keys are the FE0F-stripped emoji, so a tone-stripped base
// (which may or may not carry FE0F) always resolves.
const NORMALIZED_NAME = new Map<string, string>();
for (const [k, v] of Object.entries(EMOJI_TO_FLUENT_NAME)) {
  NORMALIZED_NAME.set(k.replace(/️/g, ''), v);
}

/** Split an emoji into its base char and skin-tone key. */
function splitTone(emoji: string): { base: string; tone: SkinToneKey } {
  for (const mod of ALL_MODIFIERS) {
    if (emoji.includes(mod)) {
      return { base: emoji.replace(mod, ''), tone: MODIFIER_TO_TONE[mod] };
    }
  }
  return { base: emoji, tone: 'default' };
}

/** Bare base emoji (no FE0F, no tone) used for map + tonable lookups. */
function bareBase(emoji: string): string {
  return splitTone(emoji).base.replace(/️/g, '');
}

/** True iff this emoji (any tone) has Fluent skin-tone variants. */
export function isTonableEmoji(emoji: string): boolean {
  return TONABLE.has(bareBase(emoji));
}

/** The skin tone currently applied to an emoji ('default' if none). */
export function skinToneOf(emoji: string): SkinToneKey {
  return splitTone(emoji).tone;
}

/** Remove any skin-tone modifier, returning the base emoji. */
export function stripSkinTone(emoji: string): string {
  return splitTone(emoji).base;
}

/**
 * Apply a skin tone to an emoji. Non-tonable emojis and the 'default' tone
 * return the bare base. The skin-tone modifier replaces the FE0F variation
 * selector (the two are mutually exclusive in a valid sequence).
 */
export function applySkinTone(emoji: string, tone: SkinToneKey): string {
  const base = splitTone(emoji).base; // drop any existing tone first
  if (!isTonableEmoji(base) || tone === 'default') {
    return base;
  }
  const modifier = SKIN_TONES.find((t) => t.key === tone)?.modifier ?? '';
  return base.replace(/️/g, '') + modifier;
}

function toneDirName(tone: SkinToneKey): string {
  // 'medium-dark' → 'Medium-Dark', 'default' → 'Default'
  return tone
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

/**
 * Build the jsDelivr URL for an emoji's Microsoft Fluent 3D PNG.
 * Handles skin-tone variants for tonable emojis. Returns null if the emoji
 * isn't in our map (caller should fall back to a different CDN / OS glyph).
 */
export function fluent3dUrlFor(emoji: string): string | null {
  const { base, tone } = splitTone(emoji);
  const lookupKey = base.replace(/️/g, '');
  const name = NORMALIZED_NAME.get(lookupKey);
  if (!name) return null;

  const root = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets';
  const dir = encodeURIComponent(name);
  const fileBase = name.toLowerCase().replace(/\s+/g, '_');

  if (TONABLE.has(lookupKey)) {
    // Tonable: assets/<Name>/<Tone>/3D/<file>_3d_<tone>.png
    const toneDir = encodeURIComponent(toneDirName(tone));
    const file = encodeURIComponent(`${fileBase}_3d_${tone}`);
    return `${root}/${dir}/${toneDir}/3D/${file}.png`;
  }
  // Non-tonable: assets/<Name>/3D/<file>_3d.png
  const file = encodeURIComponent(`${fileBase}_3d`);
  return `${root}/${dir}/3D/${file}.png`;
}
