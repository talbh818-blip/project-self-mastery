import {
  BookOpen,
  Dumbbell,
  Droplet,
  Sunrise,
  Sparkles,
  NotebookPen,
  Cigarette,
  Smartphone,
  Cookie,
  Clock,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

// Whitelist of icons available to habits. Catalog entries must use one of
// these names. Custom ("other") habits fall back to HelpCircle if unknown.
const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Dumbbell,
  Droplet,
  Sunrise,
  Sparkles,
  NotebookPen,
  Cigarette,
  Smartphone,
  Cookie,
  Clock,
};

type Props = {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function HabitIcon({ name, size = 20, strokeWidth = 1.8, className }: Props) {
  const Icon = ICONS[name] ?? HelpCircle;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}
