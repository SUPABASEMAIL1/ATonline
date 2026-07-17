import { Crown, Sun, Flame, Star, Tag, Percent, PartyPopper, Zap } from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  crown: <Crown className="h-3 w-3" />,
  sun: <Sun className="h-3 w-3" />,
  fire: <Flame className="h-3 w-3" />,
  star: <Star className="h-3 w-3" />,
  tag: <Tag className="h-3 w-3" />,
  percent: <Percent className="h-3 w-3" />,
  party: <PartyPopper className="h-3 w-3" />,
  zap: <Zap className="h-3 w-3" />,
};

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

interface HighlightBadgeProps {
  tag?: string | null;
  className?: string;
  badgeEnabled?: boolean;
  badgeText?: string;
  badgeIcon?: string;
  badgeBgColor?: string;
  badgeTextColor?: string;
}

export function HighlightBadge({ tag, className = '', badgeEnabled, badgeText, badgeIcon, badgeBgColor, badgeTextColor }: HighlightBadgeProps) {
  // New dynamic badge system
  if (badgeEnabled) {
    const icon = badgeIcon && iconMap[badgeIcon] ? iconMap[badgeIcon] : null;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${className}`}
        style={{
          backgroundColor: badgeBgColor || '#1A1A1A',
          color: badgeTextColor || '#D4AF37',
        }}
      >
        {icon}
        {badgeText || 'BADGE'}
      </span>
    );
  }

  // Legacy highlightTag system
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
