# 👥 Roles & Permissions Guide

Zaynah's POS uses a Role-Based Access Control (RBAC) system to manage terminal operations.

## 🎭 User Roles

| Role | Description | Default Permissions |
|------|-------------|---------------------|
| **Admin** | Full system access. | Everything (Bypasses checks). |
| **Manager** | Can manage stock and view reports. | Partial (Configurable). |
| **Cashier** | Daily terminal operations. | Restricted (POS only). |

## 🔑 Granular Permissions (ACL)
Beyond roles, you can toggle specific abilities for any user:

- **PRICE OVERRIDE (`can_edit_price`)**: Allows changing unit prices in the POS cart.
- **ISSUE DISCOUNTS (`can_give_discount`)**: Allows applying line-item or bill-level discounts.
- **VOID SESSIONS (`can_delete_sale`)**: Permission to delete or refund completed sales.
- **REVENUE AUDIT (`can_view_profit`)**: Access to profit/loss reports and cost prices.
- **STOCK MANAGEMENT (`can_manage_stock`)**: Ability to add/edit products and inventory.
- **PO MANAGEMENT (`can_manage_po`)**: Access to Purchase Order system.
- **RECORDS AUDIT (`can_view_records`)**: Access to unified transaction ledgers.

## 🛠️ Management
- **User Modal**: Open the "Users" module to add or edit operators.
- **Deactivation**: You can "Lock" a user to prevent login without deleting their data.
- **Password Reset**: Admins can reset any user's password; it will automatically update their `offline_hash` for local login.

## 💾 Database Implementation
Permissions are stored in the `users` table as:
1. Individual boolean columns (e.g., `can_edit_price`).
2. A `permissions` text array for dynamic feature flags (e.g., `access_reports`).
