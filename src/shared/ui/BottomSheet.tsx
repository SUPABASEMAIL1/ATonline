import React from 'react';
import { Modal } from '../../components/common/Modal';
import { cn } from '../../lib/utils';

/**
 * BottomSheet — mobile-native action-sheet wrapper around the unified Modal.
 *
 * On mobile (<768px) Modal already renders as a full-width slide-up sheet
 * with rounded top corners and scroll-lock; BottomSheet adds the visible
 * drag grip handle and safe-area bottom padding for a Facebook/Instagram
 * style feel. On desktop it falls back to Modal's normal centered dialog.
 *
 * Presentation only.
 */
export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'max' | 'full';
  footer?: React.ReactNode;
  children: React.ReactNode;
  snapPoints?: boolean;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'md',
  footer,
  children,
  snapPoints = true,
  className,
}: BottomSheetProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth={maxWidth}
      footer={footer}
      bodyClassName="pb-[calc(1rem+env(safe-area-inset-bottom))]"
      className={className}
    >
      {/* Drag grip handle — mobile only */}
      <div className="sm:hidden flex items-center justify-center pt-1 pb-2 -mt-2">
        <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
      </div>
      {children}
    </Modal>
  );
}
