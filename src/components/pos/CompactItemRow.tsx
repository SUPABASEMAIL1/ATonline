import { ShoppingBag } from 'lucide-react';

interface CompactItemRowProps {
  image?: string | null;
  name: string;
  price: string;
  subtitle?: string;
  discount?: string;
  hidePrice?: boolean;
  variant?: string;
  modifierInfo?: string;
  serialNumber?: string;
  className?: string;
  imageSize?: 'sm' | 'md';
  onClick?: () => void;
  children?: React.ReactNode;
}

const sizeMap = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
} as const;

const iconSizeMap = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
} as const;

export function CompactItemRow({
  image,
  name,
  price,
  subtitle,
  discount,
  hidePrice,
  variant,
  modifierInfo,
  serialNumber,
  className = '',
  imageSize = 'md',
  onClick,
  children,
}: CompactItemRowProps) {
  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className={`${sizeMap[imageSize]} rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0 flex items-center justify-center`}>
        {image ? (
          <img src={image} alt={name} className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className={`${iconSizeMap[imageSize]} text-gray-300`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black truncate leading-tight">{name}</p>
        {variant && <p className="text-[7px] font-bold text-gray-500 leading-tight mt-0.5">{variant}</p>}
        {modifierInfo && <p className="text-[7px] font-bold text-primary leading-tight">+{modifierInfo}</p>}
        {serialNumber && (
          <span className="text-[7px] font-black text-amber-600 bg-amber-500/10 px-1 rounded leading-none inline-block mt-0.5">
            SN: {serialNumber}
          </span>
        )}
        {subtitle && <p className="text-[7px] font-bold text-gray-500 mt-0.5">{subtitle}</p>}
        <div className="flex items-center gap-1 mt-0.5">
          {!hidePrice && (
            <span className="text-[9px] font-black text-gray-900 dark:text-white">{price}</span>
          )}
          {discount && (
            <span className="text-[7px] font-black text-rose-500 bg-rose-500/10 px-1 py-[1px] rounded leading-none">{discount}</span>
          )}
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
