import { Crown, Sun } from 'lucide-react';

interface HighlightBadgeProps {
  tag?: 'sunday' | 'crown' | string | null;
  className?: string;
}

const tagConfig: Record<string, { label: string; icon: React.ReactNode; classes: string }> = {
  sunday: {
    label: 'SUNDAY DEAL',
    icon: <Sun className="h-3 w-3" />,
    classes: 'bg-orange-500 text-white',
  },
  crown: {
    label: 'CROWN',
    icon: <Crown className="h-3 w-3" />,
    classes: 'bg-amber-500 text-white',
  },
};

export function HighlightBadge({ tag, className = '' }: HighlightBadgeProps) {
  if (!tag) return null;
  const config = tagConfig[tag];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${config.classes} ${className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
