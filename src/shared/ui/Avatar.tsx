import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Avatar — the single standardized thumbnail/avatar for all non-POS routes.
 *
 * Unifies the ~26 copy-pasted gradient-initials fallback patterns. When no
 * `src` is provided (or it fails to load) a deterministic gradient pair is
 * derived from the name, with initials shown.
 */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'square';

export interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  shape?: AvatarShape;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
};

const shapeClass: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-2xl',
};

const gradients = [
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

export function Avatar({ src, name, size = 'md', shape = 'circle', className }: AvatarProps) {
  const [imageFailed, setImageFailed] = React.useState(false);

  const initials = name
    .split(' ')
    .map((w) => w.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const gradient = gradients[hash % gradients.length];

  const showImage = src && !imageFailed;

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden shrink-0 select-none',
        sizeClass[size],
        shapeClass[shape],
        showImage ? '' : cn('bg-gradient-to-br text-white font-black', gradient),
        className
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
