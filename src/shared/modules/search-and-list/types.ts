/**
 * Shared Search & List Module — business-type-agnostic types.
 *
 * These types intentionally avoid any niche-specific terminology (no "Jeans",
 * no "Pizza", no "Medication"). Everything is expressed as `item` / `product`
 * / `category` so the module can be reused by every vertical without changes.
 */

export interface SharedItem {
  id: string;
  thumbnailUrl?: string;
  badgeLabel?: string;
  sku?: string;
  title: string;
  subtitle?: string;
  stock?: number | string;
  tag?: string;
}

export interface SharedSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onScanClick?: () => void;
  onAddAll?: () => void;
  addAllLabel?: string;
  resultsCount?: number;
  resultsCountLabel?: string;
  className?: string;
  inputClassName?: string;
}

export interface SharedProductListItemProps {
  item: SharedItem;
  selected?: boolean;
  disabled?: boolean;
  onAdd?: (item: SharedItem) => void;
  onSelect?: (item: SharedItem) => void;
  addButton?: boolean;
  selectedLabel?: string;
  showDragHandle?: boolean;
  dragHandle?: React.ReactNode;
  compact?: boolean;
}

export interface SharedProductListProps {
  items: SharedItem[];
  loading?: boolean;
  emptyStateText?: string;
  emptyStateSubtext?: string;
  selectedIds?: string[];
  onItemAdd?: (item: SharedItem) => void;
  onItemSelect?: (item: SharedItem) => void;
  onClearSearch?: () => void;
  headerTitle?: string;
  maxHeight?: string;
  skeletonCount?: number;
  draggable?: boolean;
  onReorder?: (from: number, to: number) => void;
  compact?: boolean;
  className?: string;
}
