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
  // Misc / fallback
  CheckCircle2, Zap, Leaf, TreePine, Bird, PawPrint,
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
  // Misc
  CheckCircle2, Zap, Leaf, TreePine, Bird, PawPrint,
};

// All icon names in the picker order they should appear (curated).
// We group by theme so the picker reads naturally.
export const HABIT_ICONS: readonly string[] = [
  // Health & fitness
  'Dumbbell', 'Bike', 'Footprints', 'Activity', 'Heart', 'Apple',
  // Mindfulness
  'Sparkles', 'Sun', 'Sunrise', 'Sunset', 'Moon', 'Bed', 'Smile', 'Flame', 'Mountain', 'Wind',
  // Books / learning
  'BookOpen', 'Book', 'GraduationCap', 'Brain', 'Lightbulb', 'Pencil', 'PenTool',
  // Productivity
  'NotebookPen', 'Calendar', 'Clock', 'Timer', 'ListChecks', 'Target', 'Briefcase',
  // Hydration & food
  'Droplet', 'GlassWater', 'Coffee', 'Salad', 'Carrot',
  // Bad habits / addictions
  'Cigarette', 'Wine', 'Beer', 'Cookie', 'Pizza', 'Candy',
  'Smartphone', 'Tv', 'Gamepad2', 'ShoppingCart', 'MousePointerClick',
  // Communication
  'Phone', 'MessageCircle', 'Users', 'Mail',
  // Money
  'DollarSign', 'PiggyBank', 'CreditCard', 'Wallet',
  // Creativity
  'Music', 'Guitar', 'Palette', 'Camera', 'Film',
  // Spiritual
  'Star', 'Cross', 'Compass', 'HandHeart',
  // Misc
  'CheckCircle2', 'Zap', 'Leaf', 'TreePine', 'Bird', 'PawPrint',
] as const;

// Legacy alias for older callers that referenced CUSTOM_HABIT_ICONS.
export const CUSTOM_HABIT_ICONS = HABIT_ICONS;

// Curated emojis that pair well with habit / addiction themes.
// When a habit's `icon` value isn't found in ICONS, we treat it as an emoji
// (or any other glyph) and render it as plain text.
export const HABIT_EMOJIS: readonly string[] = [
  // Fitness & body
  '🏃', '🚴', '🏋️', '🧘', '🤸', '🥊', '⚽', '🏀', '🏊', '🚶',
  // Food
  '🍎', '🥗', '🥦', '🥕', '🍓', '🥑', '🍌', '🥚', '🍞', '🥛',
  // Drinks
  '💧', '☕', '🍵', '🧋', '🥤',
  // Bad habits / addictions
  '🚬', '🍺', '🍷', '🍕', '🍔', '🍟', '🍫', '🍩', '🍰', '🍭',
  '📱', '📺', '🎮', '💸', '🛍️',
  // Sleep / wellness
  '😴', '🛏️', '🌙', '☀️', '🌅', '🧠', '💭', '🕯️', '🌿',
  // Books / learning
  '📚', '📖', '📝', '✏️', '🎓', '💡', '📊',
  // Productivity
  '💼', '📅', '⏰', '⏱️', '✅', '🎯', '🗒️',
  // Money
  '💰', '💵', '💳', '🏦',
  // Music & creative
  '🎵', '🎶', '🎸', '🎹', '🎨', '📷', '🎬',
  // Spiritual / mindset
  '⭐', '✨', '🔥', '❤️', '🙏', '💖', '🌸', '🦋',
  // Nature
  '🌳', '🌱', '🌻', '🌊', '🏔️', '🐦', '🐶',
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
