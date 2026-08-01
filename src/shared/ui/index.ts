/**
 * src/shared/ui — the single standardized UI component library for all
 * non-POS routes.
 *
 * POS (`src/components/pos/**`) is completely excluded and keeps its own
 * markup. Estore keeps its CSS-variable theme; components here accept
 * `className` escape hatches for it.
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Card, type CardProps, type CardVariant, type CardPadding } from './Card';
export { Badge, type BadgeProps, type BadgeTone, type BadgeSize, type BadgeVariant } from './Badge';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './SegmentedControl';
export { ToggleSwitch, type ToggleSwitchProps } from './ToggleSwitch';
export { SubTabBar, type SubTabBarProps, type SubTab } from './SubTabBar';
export { Avatar, type AvatarProps, type AvatarSize, type AvatarShape } from './Avatar';
export {
  usePagination,
  Pagination,
  LoadMoreButton,
  type PaginationProps,
  type LoadMoreButtonProps,
} from './Pagination';
export {
  DateRangePicker,
  type DateRangePickerProps,
  type DateRangePreset,
} from './DateRangePicker';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { BottomSheet, type BottomSheetProps } from './BottomSheet';
export { Select, type SelectProps } from './Select';
