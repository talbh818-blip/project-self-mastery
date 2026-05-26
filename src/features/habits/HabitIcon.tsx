import {
  // Health / fitness
  Dumbbell, Bike, Footprints, Heart, Activity, Apple,
  // Mindfulness / wellness
  Sparkles, Sun, Sunrise, Sunset, Moon, Bed, Smile, Flame, Mountain, Wind,
  // Books / learning
  BookOpen, Book, GraduationCap, Brain, Lightbulb, Pencil, PenTool,
  // Productivity / planning
  NotebookPen, Calendar, Clock, Timer, ListChecks, Target, Briefcase,
  // Hydration / nutrition
  Droplet, GlassWater, Coffee, Salad, Carrot,
  // Bad habits / addictions
  Cigarette, Wine, Beer, Cookie, Pizza, Candy,
  Smartphone, Tv, Gamepad2, ShoppingCart, MousePointerClick,
  // Communication / social
  Phone, MessageCircle, Users, Mail,
  // Money / finance
  DollarSign, PiggyBank, CreditCard, Wallet,
  // Creativity / hobbies
  Music, Guitar, Palette, Camera, Film,
  // Spiritual / reflective
  Star, Cross, Compass, HandHeart,
  // Misc positive
  CheckCircle2, Zap, Leaf, TreePine, Bird, PawPrint,
  // Achievement / motivation (positive)
  Trophy, Award, Medal, Rocket, ThumbsUp, Crown,
  // Warnings / breaking habits (negative)
  Skull, AlertTriangle, Ban, XCircle, ThumbsDown, Dices,
  // Awareness / monitoring
  Eye,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

// Whitelist of icons available to habits.
// Catalog seed and custom-habit picker reference these names.
// Unknown icon names fall back to HelpCircle.
const ICONS: Record<string, LucideIcon> = {
  // Health / fitness
  Dumbbell, Bike, Footprints, Heart, Activity, Apple,
  // Mindfulness / wellness
  Sparkles, Sun, Sunrise, Sunset, Moon, Bed, Smile, Flame, Mountain, Wind,
  // Books / learning
  BookOpen, Book, GraduationCap, Brain, Lightbulb, Pencil, PenTool,
  // Productivity
  NotebookPen, Calendar, Clock, Timer, ListChecks, Target, Briefcase,
  // Hydration / nutrition
  Droplet, GlassWater, Coffee, Salad, Carrot,
  // Bad habits / addictions
  Cigarette, Wine, Beer, Cookie, Pizza, Candy,
  Smartphone, Tv, Gamepad2, ShoppingCart, MousePointerClick,
  // Communication
  Phone, MessageCircle, Users, Mail,
  // Money
  DollarSign, PiggyBank, CreditCard, Wallet,
  // Creativity
  Music, Guitar, Palette, Camera, Film,
  // Spiritual
  Star, Cross, Compass, HandHeart,
  // Misc positive
  CheckCircle2, Zap, Leaf, TreePine, Bird, PawPrint,
  // Achievement / motivation
  Trophy, Award, Medal, Rocket, ThumbsUp, Crown,
  // Warnings / breaking
  Skull, AlertTriangle, Ban, XCircle, ThumbsDown, Dices,
  // Awareness
  Eye,
};

// ----------------------------------------------------------------------------
// Icons curated for POSITIVE habits — things to build.
// ----------------------------------------------------------------------------
export const POSITIVE_HABIT_ICONS: readonly string[] = [
  // Health & fitness
  'Dumbbell', 'Bike', 'Footprints', 'Activity', 'Heart', 'Apple',
  // Mindfulness / wellness
  'Sparkles', 'Sun', 'Sunrise', 'Sunset', 'Moon', 'Bed', 'Smile', 'Flame',
  'Mountain', 'Wind',
  // Books / learning
  'BookOpen', 'Book', 'GraduationCap', 'Brain', 'Lightbulb', 'Pencil', 'PenTool',
  // Productivity
  'NotebookPen', 'Calendar', 'Clock', 'Timer', 'ListChecks', 'Target', 'Briefcase',
  // Hydration & healthy food
  'Droplet', 'GlassWater', 'Coffee', 'Salad', 'Carrot',
  // Communication
  'Phone', 'MessageCircle', 'Users', 'Mail',
  // Money (saving)
  'DollarSign', 'PiggyBank', 'Wallet',
  // Creativity
  'Music', 'Guitar', 'Palette', 'Camera', 'Film',
  // Spiritual
  'Star', 'Cross', 'Compass', 'HandHeart',
  // Achievement / motivation
  'Trophy', 'Award', 'Medal', 'Rocket', 'ThumbsUp', 'Crown',
  // Nature / misc positive
  'CheckCircle2', 'Zap', 'Leaf', 'TreePine', 'Bird', 'PawPrint',
  // Awareness
  'Eye',
];

// ----------------------------------------------------------------------------
// Icons curated for NEGATIVE habits — addictions to break.
// ----------------------------------------------------------------------------
export const NEGATIVE_HABIT_ICONS: readonly string[] = [
  // Substances
  'Cigarette', 'Wine', 'Beer',
  // Junk food
  'Cookie', 'Pizza', 'Candy',
  // Screens / games
  'Smartphone', 'Tv', 'Gamepad2', 'MousePointerClick',
  // Shopping / spending
  'ShoppingCart', 'CreditCard',
  // Caffeine (sometimes a habit to cut)
  'Coffee',
  // Gambling
  'Dices',
  // Warnings / breaking
  'Skull', 'AlertTriangle', 'Ban', 'XCircle', 'ThumbsDown', 'Flame',
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
  // Healthy food
  '🍎', '🥗', '🥦', '🥕', '🍓', '🥑', '🍌', '🥚', '🍞', '🥛',
  // Healthy drinks
  '💧', '☕', '🍵', '🧋', '🥤',
  // Sleep / wellness
  '😴', '🛏️', '🌙', '☀️', '🌅', '🧠', '💭', '🕯️', '🌿',
  // Books / learning
  '📚', '📖', '📝', '✏️', '🎓', '💡', '📊',
  // Productivity
  '💼', '📅', '⏰', '⏱️', '✅', '🎯', '🗒️',
  // Money (saving)
  '💰', '💵', '🏦',
  // Music & creative
  '🎵', '🎶', '🎸', '🎹', '🎨', '📷', '🎬',
  // Achievement
  '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🚀', '🌟', '🎉', '🌈',
  // Spiritual / mindset
  '⭐', '✨', '🔥', '❤️', '🙏', '💖', '🌸', '🦋',
  // Nature
  '🌳', '🌱', '🌻', '🌊', '🏔️', '🐦', '🐶',
];

export const NEGATIVE_HABIT_EMOJIS: readonly string[] = [
  // Substances
  '🚬', '🍺', '🍷', '🍸', '🥃', '🥂',
  // Junk food
  '🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍰', '🍫', '🍭', '🍪',
  // Screens / games
  '📱', '📺', '🎮', '💻', '⌨️',
  // Shopping / money waste
  '💸', '🛍️', '💳',
  // Gambling
  '🎰', '🎲',
  // Lazy / oversleeping
  '🛋️',
  // Negative emotions
  '😡', '🤬', '😤',
  // Generic warnings
  '⛔', '🚫', '❌', '⚠️', '💀',
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
  // Emoji / fallback text path — sized via font-size so it matches the box.
  if (name && name.trim().length > 0) {
    return (
      <span
        className={className}
        style={{
          fontSize: size * 1.1,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {name}
      </span>
    );
  }
  return <HelpCircle size={size} strokeWidth={strokeWidth} className={className} />;
}
