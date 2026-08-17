// ============================================================================
// PERMISSIONS — SINGLE SOURCE OF TRUTH for authorization (MASTER §2.1.2)
// ----------------------------------------------------------------------------
// Every route guard (RequireAccess) and every fine-grained UI flag
// (edit price / give discount / delete sale / refund / etc.) is DERIVED from
// this map. There is no second, scattered permission definition anywhere.
//
// Enforcement is two-layer:
//   1. APP layer  -> RequireAccess() + boolean flags (UX, instant feedback)
//   2. SERVER layer -> RPC role guards + RLS on settings/users (MASTER §2.1.4)
// The app layer can be bypassed; the server layer cannot.
// ============================================================================

export type Role = 'admin' | 'manager' | 'cashier' | 'salesman';

export const ROLES: Role[] = ['admin', 'manager', 'cashier', 'salesman'];

export type Permission =
  | 'view_pos'
  | 'view_dashboard'
  | 'view_transactions'
  | 'view_reports'
  | 'view_inventory'
  | 'manage_products'
  | 'manage_stock'
  | 'view_suppliers'
  | 'manage_suppliers'
  | 'view_purchase_orders'
  | 'manage_po'
  | 'view_expenses'
  | 'manage_expenses'
  | 'view_discounts'
  | 'manage_discounts'
  | 'view_customers'
  | 'manage_customers'
  | 'view_online_orders'
  | 'view_settings'
  | 'manage_settings'
  | 'view_users'
  | 'manage_users'
  | 'edit_price'
  | 'give_discount'
  | 'delete_sale'
  | 'refund_sale'
  | 'refund_unlimited'
  | 'void_sale'
  | 'export_database'
  | 'view_profit'
  | 'view_records';

// Role -> action -> allowed. `true` everywhere for admin.
export const PERMISSIONS: Record<Role, Record<Permission, boolean>> = {
  admin: {
    view_pos: true,
    view_dashboard: true,
    view_transactions: true,
    view_reports: true,
    view_inventory: true,
    manage_products: true,
    manage_stock: true,
    view_suppliers: true,
    manage_suppliers: true,
    view_purchase_orders: true,
    manage_po: true,
    view_expenses: true,
    manage_expenses: true,
    view_discounts: true,
    manage_discounts: true,
    view_customers: true,
    manage_customers: true,
    view_online_orders: true,
    view_settings: true,
    manage_settings: true,
    view_users: true,
    manage_users: true,
    edit_price: true,
    give_discount: true,
    delete_sale: true,
    refund_sale: true,
    refund_unlimited: true,
    void_sale: true,
    export_database: true,
    view_profit: true,
    view_records: true,
  },
  manager: {
    view_pos: true,
    view_dashboard: true,
    view_transactions: true,
    view_reports: true,
    view_inventory: true,
    manage_products: true,
    manage_stock: true,
    view_suppliers: true,
    manage_suppliers: true,
    view_purchase_orders: true,
    manage_po: true,
    view_expenses: true,
    manage_expenses: true,
    view_discounts: true,
    manage_discounts: true,
    view_customers: true,
    manage_customers: true,
    view_online_orders: true,
    view_settings: true,
    manage_settings: true,
    view_users: true,
    manage_users: true,
    edit_price: true,
    give_discount: true,
    delete_sale: true,
    refund_sale: true,
    refund_unlimited: true,
    void_sale: true,
    export_database: false, // DB export/backup is owner (admin) only
    view_profit: true,
    view_records: true,
  },
  cashier: {
    view_pos: true,
    view_dashboard: true,
    view_transactions: true,
    view_reports: true,
    view_inventory: true, // read-only browse
    manage_products: false,
    manage_stock: false,
    view_suppliers: true,
    manage_suppliers: false,
    view_purchase_orders: true,
    manage_po: false,
    view_expenses: true,
    manage_expenses: false,
    view_discounts: true,
    manage_discounts: false,
    view_customers: true,
    manage_customers: false,
    view_online_orders: true,
    view_settings: false, // cannot open Settings page
    manage_settings: false,
    view_users: false, // cannot open Users page
    manage_users: false,
    edit_price: false,
    give_discount: true,
    delete_sale: false, // server-guarded: only admin/manager
    refund_sale: true, // limited (refund_unlimited = false)
    refund_unlimited: false,
    void_sale: false,
    export_database: false,
    view_profit: false,
    view_records: true,
  },
  salesman: {
    view_pos: true,
    view_dashboard: true,
    view_transactions: false,
    view_reports: false,
    view_inventory: false,
    manage_products: false,
    manage_stock: false,
    view_suppliers: false,
    manage_suppliers: false,
    view_purchase_orders: false,
    manage_po: false,
    view_expenses: false,
    manage_expenses: false,
    view_discounts: false,
    manage_discounts: false,
    view_customers: true,
    manage_customers: false,
    view_online_orders: false,
    view_settings: false,
    manage_settings: false,
    view_users: false,
    manage_users: false,
    edit_price: false,
    give_discount: true,
    delete_sale: false,
    refund_sale: false, // server-guarded: cashier+ only, salesman excluded
    refund_unlimited: false,
    void_sale: false,
    export_database: false,
    view_profit: false,
    view_records: false,
  },
};

/**
 * Authoritative check. Unknown/empty role => DENY (fail-closed, MASTER §2.1.3).
 */
export function can(role: string | undefined | null, action: Permission): boolean {
  if (!role) return false;
  const r = role as Role;
  if (!(r in PERMISSIONS)) return false;
  return PERMISSIONS[r][action] === true;
}

/**
 * Server-side mirror of `can()` for SQL RPCs / RLS (same matrix, same semantics).
 * Kept as a plain object so it can be serialized into migrations if needed.
 */
export const SERVER_ROLE_GUARD = {
  // Roles allowed to perform irreversible stock-affecting deletes:
  canDeleteSale: ['admin', 'manager'] as Role[],
  // Roles allowed to issue refunds (salesman excluded):
  canRefundSale: ['admin', 'manager', 'cashier'] as Role[],
  // Roles allowed to write settings / manage users (server-side RLS):
  canManageSettings: ['admin', 'manager'] as Role[],
  canManageUsers: ['admin', 'manager'] as Role[],
};

export function isRole(value: any): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}
