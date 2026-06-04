import {
  // Health / fitness
  Dumbbell, Bike, Footprints, Heart, HeartPulse, Activity, Apple, Stethoscope,
  Pill, Volleyball,
  // Mindfulness / wellness
  Sparkles, Sparkle, Sun, Sunrise, Sunset, Moon, Bed, Smile, Flame, Mountain,
  MountainSnow, Wind, Hourglass, Infinity, BrainCircuit,
  // Books / learning
  BookOpen, Book, GraduationCap, Brain, Lightbulb, Pencil, PenTool,
  Newspaper, ScrollText, FileText, Languages, School, Library,
  // Productivity / planning
  NotebookPen, Calendar, CalendarCheck, Clock, AlarmClock, Timer, ListChecks,
  Target, Briefcase, Flag,
  // Hydration / nutrition
  Droplet, GlassWater, Coffee, Salad, Carrot, ChefHat, UtensilsCrossed,
  Sandwich, Soup, Wheat, Egg, Milk, Bean, Citrus, Grape, Cherry, Croissant,
  Fish, Beef, Drumstick, Vegan,
  // Bad habits / addictions
  Cigarette, Wine, Beer, Cookie, Pizza, Candy,
  Smartphone, Tv, Gamepad2, ShoppingCart, MousePointerClick,
  Bug, BatteryLow, TrendingDown, Frown,
  // Communication / social
  Phone, MessageCircle, MessageSquare, Users, Mail, Bell, Handshake,
  HeartHandshake, Gift,
  // Money / finance
  DollarSign, PiggyBank, CreditCard, Wallet, TrendingUp, Coins, Banknote,
  // Creativity / hobbies
  Music, Guitar, Palette, Camera, Film, Video, Mic, Headphones, Drum,
  Paintbrush, Scissors, Hammer, Wrench, PartyPopper, Stamp,
  // Spiritual / reflective
  Star, Cross, Compass, HandHeart, Church,
  // Tech / work
  Code, Monitor,
  // Travel / movement
  Map, Plane, Train, Car, Sailboat,
  // Family / care
  Baby,
  // Misc positive
  CheckCircle2, Zap, Leaf, TreePine, TreeDeciduous, Bird, PawPrint, Flower,
  Sprout, Globe, Cloud, CloudRain, Snowflake, Tent, Waves,
  // Achievement / motivation (positive)
  Trophy, Award, Medal, Rocket, ThumbsUp, Crown,
  // Warnings / breaking habits (negative)
  Skull, AlertTriangle, Ban, XCircle, ThumbsDown, Dices,
  // Awareness / monitoring
  Eye, ScanEye, Telescope, Microscope, Atom,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
// Twemoji wrapper — turns an emoji character into a hosted SVG so it renders
// identically on every device instead of falling back to whatever emoji font
// the user's OS happens to have.
import { Emoji } from '../../components/Emoji';

// Whitelist of icons available to habits.
// Catalog seed and custom-habit picker reference these names.
// Unknown icon names fall back to HelpCircle.
const ICONS: Record<string, LucideIcon> = {
  // Health / fitness
  Dumbbell, Bike, Footprints, Heart, HeartPulse, Activity, Apple, Stethoscope,
  Pill, Volleyball,
  // Mindfulness / wellness
  Sparkles, Sparkle, Sun, Sunrise, Sunset, Moon, Bed, Smile, Flame, Mountain,
  MountainSnow, Wind, Hourglass, Infinity, BrainCircuit,
  // Books / learning
  BookOpen, Book, GraduationCap, Brain, Lightbulb, Pencil, PenTool,
  Newspaper, ScrollText, FileText, Languages, School, Library,
  // Productivity
  NotebookPen, Calendar, CalendarCheck, Clock, AlarmClock, Timer, ListChecks,
  Target, Briefcase, Flag,
  // Hydration / nutrition
  Droplet, GlassWater, Coffee, Salad, Carrot, ChefHat, UtensilsCrossed,
  Sandwich, Soup, Wheat, Egg, Milk, Bean, Citrus, Grape, Cherry, Croissant,
  Fish, Beef, Drumstick, Vegan,
  // Bad habits / addictions
  Cigarette, Wine, Beer, Cookie, Pizza, Candy,
  Smartphone, Tv, Gamepad2, ShoppingCart, MousePointerClick,
  Bug, BatteryLow, TrendingDown, Frown,
  // Communication
  Phone, MessageCircle, MessageSquare, Users, Mail, Bell, Handshake,
  HeartHandshake, Gift,
  // Money
  DollarSign, PiggyBank, CreditCard, Wallet, TrendingUp, Coins, Banknote,
  // Creativity
  Music, Guitar, Palette, Camera, Film, Video, Mic, Headphones, Drum,
  Paintbrush, Scissors, Hammer, Wrench, PartyPopper, Stamp,
  // Spiritual
  Star, Cross, Compass, HandHeart, Church,
  // Tech / work
  Code, Monitor,
  // Travel
  Map, Plane, Train, Car, Sailboat,
  // Family / care
  Baby,
  // Misc positive
  CheckCircle2, Zap, Leaf, TreePine, TreeDeciduous, Bird, PawPrint, Flower,
  Sprout, Globe, Cloud, CloudRain, Snowflake, Tent, Waves,
  // Achievement / motivation
  Trophy, Award, Medal, Rocket, ThumbsUp, Crown,
  // Warnings / breaking
  Skull, AlertTriangle, Ban, XCircle, ThumbsDown, Dices,
  // Awareness
  Eye, ScanEye, Telescope, Microscope, Atom,
};

// ----------------------------------------------------------------------------
// Icons curated for POSITIVE habits — things to build.
// ----------------------------------------------------------------------------
export const POSITIVE_HABIT_ICONS: readonly string[] = [
  // Health & fitness
  'Dumbbell', 'Bike', 'Footprints', 'Activity', 'Heart', 'HeartPulse',
  'Apple', 'Stethoscope', 'Pill', 'Volleyball',
  // Mindfulness / wellness
  'Sparkles', 'Sparkle', 'Sun', 'Sunrise', 'Sunset', 'Moon', 'Bed', 'Smile',
  'Flame', 'Mountain', 'MountainSnow', 'Wind', 'Hourglass', 'Infinity',
  // Books / learning
  'BookOpen', 'Book', 'Library', 'GraduationCap', 'School', 'Brain',
  'BrainCircuit', 'Lightbulb', 'Pencil', 'PenTool', 'Newspaper',
  'ScrollText', 'FileText', 'Languages',
  // Productivity
  'NotebookPen', 'Calendar', 'CalendarCheck', 'Clock', 'AlarmClock', 'Timer',
  'ListChecks', 'Target', 'Flag', 'Briefcase',
  // Hydration & healthy food
  'Droplet', 'GlassWater', 'Milk', 'Coffee', 'Salad', 'Carrot', 'Apple',
  'Bean', 'Wheat', 'Egg', 'Sandwich', 'Soup', 'ChefHat', 'UtensilsCrossed',
  'Fish', 'Beef', 'Drumstick', 'Citrus', 'Grape', 'Cherry', 'Croissant',
  'Vegan',
  // Communication / social
  'Phone', 'MessageCircle', 'MessageSquare', 'Users', 'Mail', 'Bell',
  'Handshake', 'HeartHandshake', 'Gift',
  // Money (saving)
  'DollarSign', 'PiggyBank', 'Wallet', 'Coins', 'Banknote', 'TrendingUp',
  // Creativity
  'Music', 'Mic', 'Headphones', 'Guitar', 'Drum', 'Palette', 'Paintbrush',
  'Camera', 'Film', 'Video', 'Scissors', 'Hammer', 'Wrench', 'Stamp',
  'PartyPopper',
  // Tech / work
  'Code', 'Monitor',
  // Travel / movement
  'Map', 'Plane', 'Train', 'Car', 'Sailboat',
  // Spiritual
  'Star', 'Cross', 'Compass', 'HandHeart', 'Church',
  // Family / care
  'Baby',
  // Achievement / motivation
  'Trophy', 'Award', 'Medal', 'Rocket', 'ThumbsUp', 'Crown',
  // Nature / misc positive
  'CheckCircle2', 'Zap', 'Leaf', 'TreePine', 'TreeDeciduous', 'Flower',
  'Sprout', 'Bird', 'PawPrint', 'Globe', 'Cloud', 'CloudRain', 'Snowflake',
  'Tent', 'Waves',
  // Awareness / focus
  'Eye', 'ScanEye', 'Telescope', 'Microscope', 'Atom',
];

// ----------------------------------------------------------------------------
// Icons curated for NEGATIVE habits — addictions to break.
// ----------------------------------------------------------------------------
export const NEGATIVE_HABIT_ICONS: readonly string[] = [
  // Substances
  'Cigarette', 'Wine', 'Beer',
  // Junk food
  'Cookie', 'Pizza', 'Candy', 'Croissant',
  // Screens / games
  'Smartphone', 'Tv', 'Monitor', 'Gamepad2', 'MousePointerClick',
  // Shopping / spending
  'ShoppingCart', 'CreditCard', 'TrendingDown',
  // Caffeine (sometimes a habit to cut)
  'Coffee',
  // Gambling
  'Dices',
  // Time / energy drain
  'Hourglass', 'BatteryLow', 'Bug',
  // Negative emotions
  'Frown', 'ThumbsDown',
  // Warnings / breaking
  'Skull', 'AlertTriangle', 'Ban', 'XCircle', 'Flame',
  // Awareness
  'Eye',
];

// Combined list — kept for back-compat callers (e.g. emoji-mode detection
// in HabitPickerSheet that needs to know "is this name an icon").
export const HABIT_ICONS: readonly string[] = [
  ...POSITIVE_HABIT_ICONS,
  ...NEGATIVE_HABIT_ICONS.filter((n) => !POSITIVE_HABIT_ICONS.includes(n)),
];

// Legacy alias.
export const CUSTOM_HABIT_ICONS = HABIT_ICONS;

// ----------------------------------------------------------------------------
// Emojis — split by habit type.
// ----------------------------------------------------------------------------
export const POSITIVE_HABIT_EMOJIS: readonly string[] = [
  // Fitness & body
  '🏃', '🚴', '🏋️', '🧘', '🤸', '🥊', '⚽', '🏀', '🏊', '🚶', '💪',
  '🧗', '🏌️', '🏄', '🚣', '🤽', '🥋', '🏐', '🎾', '🎳', '🛹', '🛼',
  '⛸️', '🎿', '🏂', '🤿', '🥏',
  // Healthy food
  '🍎', '🥗', '🥦', '🥕', '🍓', '🥑', '🍌', '🥚', '🍞', '🥛',
  '🥬', '🌽', '🥒', '🫐', '🍇', '🍊', '🍋', '🍐', '🍒', '🍅',
  '🐟', '🍳', '🥜', '🌶️', '🫑',
  // Healthy drinks
  '💧', '☕', '🍵', '🧋', '🥤', '🧉',
  // Sleep / wellness
  '😴', '🛏️', '🌙', '☀️', '🌅', '🌄', '🧠', '💭', '🕯️', '🌿',
  '🛁', '🚿', '🪥', '🧼', '🧴', '🪒',
  // Health / medical
  '💊', '🩺', '🦷', '🧬', '🫀', '🫁',
  // Books / learning
  '📚', '📖', '📝', '✏️', '🎓', '💡', '📊', '📰', '📜', '🖊️',
  '🔖', '📑', '📒',
  // Productivity / focus
  '💼', '📅', '⏰', '⏱️', '✅', '🎯', '🗒️', '📌', '📍', '📎',
  '🗓️', '🧭',
  // Money (saving)
  '💰', '💵', '🪙', '💴', '💶', '💷', '🏦', '📈', '💱',
  // Music & creative
  '🎵', '🎶', '🎸', '🎹', '🎨', '📷', '🎬', '🎥', '📹', '🎤',
  '🎧', '🎻', '🥁', '🎺', '🎷', '🖌️', '🖼️', '🧵', '🧶', '✂️',
  '📐', '📏', '🛠️', '🔧', '🔨', '⚙️', '⛏️', '🪛',
  // Tech / work
  '💻', '🖥️', '⌨️', '🖱️', '💾', '📡',
  // Travel / movement
  '✈️', '🚆', '🚇', '🚗', '🚙', '🚌', '🛴', '⛵', '🛶', '🚢',
  '🗺️', '🧳',
  // Family / care
  '👶', '👨‍👩‍👧', '🤱', '👨‍👩‍👦',
  // Communication
  '🗣️', '💬', '📣', '🔔', '✉️', '📧', '🤝', '🤗',
  // Achievement
  '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🚀', '🌟', '🎉', '🌈',
  '🎁', '🎀', '🏁', '🚩', '🎗️',
  // Spiritual / mindset
  '⭐', '✨', '🔥', '❤️', '🙏', '💖', '🌸', '🦋', '🕉️', '☮️',
  '☯️', '✡️', '☪️', '☸️', '🛐', '⛪', '🕍', '🕌', '🛕',
  // Eyes / awareness
  '👁️', '👀',
  // Nature & weather
  '🌳', '🌲', '🌱', '🌻', '🌷', '🌹', '🌺', '🌼', '🪷', '🌾',
  '🌵', '🌴', '🪴', '🍀', '🍃', '🍂', '🍁',
  '🌊', '🏔️', '⛰️', '🏝️', '🏖️',
  '☁️', '⛅', '🌧️', '⛄', '❄️', '🌧️', '🌪️', '🌈',
  // Stars / space
  '⭐', '💫', '☄️', '🌠', '🌌', '🪐',
  // Animals
  '🐶', '🐱', '🐰', '🦊', '🐻', '🐨', '🐼', '🐯', '🦁', '🐢',
  '🦋', '🐦', '🦉', '🐝', '🐬', '🐳',
  // Positive emotions
  '🤩', '😊', '😃', '😄', '😁', '🥰', '😎', '🤔', '😌', '🥳',
];

export const NEGATIVE_HABIT_EMOJIS: readonly string[] = [
  // Substances
  '🚬', '🍺', '🍷', '🍸', '🥃', '🥂', '🍾', '💉', '🧪', '💊',
  // Junk food
  '🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍰', '🍫', '🍭', '🍪',
  '🍦', '🍨', '🧁', '🥓', '🍳',
  // Screens / games / social
  '📱', '📺', '🎮', '💻', '⌨️', '🖥️', '📞',
  // Shopping / money waste
  '💸', '🛍️', '💳', '📉',
  // Gambling
  '🎰', '🎲', '🃏',
  // Lazy / oversleeping
  '🛋️', '🥱', '😪', '⏳', '⌛',
  // Negative emotions
  '😡', '🤬', '😤', '🤥', '😈', '👿', '🙄', '😒', '😞', '😟',
  '😣', '😭', '😢', '💔',
  // Generic warnings
  '⛔', '🚫', '❌', '⚠️', '💀', '☠️', '🔞', '🚭', '🚯',
];

// Combined emoji list — for back-compat.
export const HABIT_EMOJIS: readonly string[] = [
  ...POSITIVE_HABIT_EMOJIS,
  ...NEGATIVE_HABIT_EMOJIS.filter((e) => !POSITIVE_HABIT_EMOJIS.includes(e)),
];

// True iff `name` is a known Lucide icon name in our ICONS whitelist.
export function isLucideIconName(name: string): boolean {
  return name in ICONS;
}

type Props = {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function HabitIcon({ name, size = 20, strokeWidth = 1.8, className }: Props) {
  // Lucide icon path
  if (name in ICONS) {
    const Icon = ICONS[name];
    return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
  }
  // Emoji path — routed through <Emoji /> so it renders as a Twemoji SVG and
  // looks identical on every device, regardless of which OS emoji font the
  // user has. Wrapped in a centered flex box so it occupies the same square
  // a Lucide icon would, with the same baseline.
  if (name && name.trim().length > 0) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Emoji emoji={name} size={Math.round(size * 1.05)} />
      </span>
    );
  }
  return <HelpCircle size={size} strokeWidth={strokeWidth} className={className} />;
}
