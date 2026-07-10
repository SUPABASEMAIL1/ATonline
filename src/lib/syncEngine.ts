import { supabase, enableFullAuthInit } from './supabase';
import { localDb, PendingOp, SETTINGS_ID } from './localDb';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds
const BACKOFF_INITIAL = 5 * 1000; // 5s
const BACKOFF_MAX = 60 * 1000; // 60s
const SYNC_TIMEOUT = 120 * 1000; // 120s

let _isSyncing = false;
let _syncNeeded = false;
let _offlineBackoff = 0;
let _offlineTimer: ReturnType<typeof setTimeout> | null = null;
let _offlineMode = false;

export function isSyncEngineBusy(): boolean {
  return _isSyncing;
}

export function clearBlacklist(entity?: string) {
    if (entity) {
        delete COLUMN_BLACKLIST[entity];
    } else {
        for (const key in COLUMN_BLACKLIST) delete COLUMN_BLACKLIST[key];
    }
}

// Dynamic blacklist for columns that don't exist in Supabase (Self-healing)
const COLUMN_BLACKLIST: Record<string, Set<string>> = {
    // Hardcoded blacklists removed — mappers in services.ts now handle snake_case conversion.
    // Dynamic entries will be added here if Supabase returns 400 "Column not found" errors.
};

// Fields that do NOT exist in any Supabase table (single-tenant app — Rule F7)
// These are always stripped from remote payloads regardless of entity.
const GLOBAL_STRIP_FIELDS = new Set(['workspaceId', 'workspace_id']);

function filterPayload(entity: string, payload: any) {
    if (!payload || typeof payload !== 'object') return payload;

    const blacklist = COLUMN_BLACKLIST[entity];
    const filtered: Record<string, any> = {};
    let stripped = false;
    const strippedCols: string[] = [];

    for (const key in payload) {
        // Skip if value is undefined or null (prevents NOT NULL violations on partial updates/upserts)
        if (payload[key] === undefined || payload[key] === null) {
            continue;
        }

        // Global strip: fields that never exist on any Supabase table (Rule F7)
        if (GLOBAL_STRIP_FIELDS.has(key)) {
            continue;
        }

        if (blacklist && blacklist.has(key)) {
            stripped = true;
            strippedCols.push(key);
        } else {
            filtered[key] = payload[key];
        }
    }

    if (stripped) {
        console.warn(`[SyncEngine] ⚠️ DATA LOSS WARNING: Stripped blacklisted columns from ${entity}:`, strippedCols, ". These fields are NOT syncing to cloud. Add them to Supabase schema or fix the mapper in services.ts.");
    }

    return filtered;
}

function recordBlacklistedColumn(entity: string, errorMsg: string) {
    if (entity === 'app_settings') return false; 
    // Example: "Could not find the 'ai_v2_enabled' column of 'app_settings' in the schema cache"
    const match = errorMsg.match(/Could not find the '([^']+)' column of '([^']+)'/);
    if (match) {
        const col = match[1];
        const table = match[2];

        if (!COLUMN_BLACKLIST[entity]) COLUMN_BLACKLIST[entity] = new Set();
        COLUMN_BLACKLIST[entity].add(col);

        console.error(`
            ⚠️ SYNC ERROR: Column '${col}' auto-blacklisted.
            This means data for this field is NOT syncing to cloud.
            Fix: Add column to Supabase table '${table}' or fix mapper function in services.ts.
            Entity: ${entity}
        `);
        return true;
    }
    return false;
}

// ---------- Remote Sync Time Helpers ----------

export async function updateSyncTime() {
    try {
        const now = new Date().toISOString();

        const { data: firstRow } = await supabase.from('app_settings').select('id').limit(1).maybeSingle();

        if (firstRow) {
            await supabase.from('app_settings').update({ updated_at: now } as any).eq('id', firstRow.id);
        } else {
            await supabase.from('app_settings').insert({ updated_at: now, id: SETTINGS_ID } as any);
        }

        localStorage.setItem('local_handshake', now);
        window.dispatchEvent(new Event('sync-status-changed'));
    } catch (err) {
        console.error('Failed to update remote sync time:', err);
    }
}

export async function getSyncTime(): Promise<Date | null> {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('updated_at')
            .limit(1)
            .maybeSingle();

        if (error || !data || !data.updated_at) return null;
        return new Date(data.updated_at);
    } catch (err) {
        return null;
    }
}

// ---------- Execute Workers ----------

async function executeOp(op: PendingOp): Promise<void> {
    const tableMap: Record<string, string> = {
        products: 'products',
        customers: 'customers',
        sales: 'sales',
        discounts: 'discounts',
        users: 'users',
        sales_tabs: 'sales_tabs',
        app_settings: 'app_settings',
        expenses: 'expenses',
        product_batches: 'product_batches',
        suppliers: 'suppliers',
        categories: 'categories',
        purchase_records: 'purchase_records',
        purchase_orders: 'purchase_orders',
        purchase_order_items: 'purchase_order_items',
        supplier_transactions: 'supplier_transactions',
        payments: 'payments',
        stock_history: 'stock_history',
        bundles: 'bundles',
        bundle_items: 'bundle_items',
        bundle_slots: 'bundle_slots',
        bundle_slot_options: 'bundle_slot_options'
    };

    const table = tableMap[op.entity];
    if (!table) {
        console.warn(`[SyncEngine] No table mapping for entity: ${op.entity}`);
        return;
    }

    const { opType, entityId, payload: originalPayload } = op;
    const MAX_SCHEMA_RETRIES = 100; // Increased to 100 to handle tables with many new fields
    let schemaRetries = 0;

    // --- EXECUTION LOOP (AGGRESSIVE SELF-HEALING) ---
    while (schemaRetries < MAX_SCHEMA_RETRIES) {
        let payload = filterPayload(op.entity, originalPayload);

        // --- HYDRATION: Fix items that were queued with partial/broken payloads ---
        if (op.entity === 'sales_tabs' && opType !== 'delete') {
            if (!payload.name || !payload.user_id) {
                const local = await localDb.salesTabs.get(op.entityId);
                if (local) {
                    payload = {
                        ...payload,
                        name: payload.name || local.name,
                        user_id: payload.user_id || local.userId
                    };
                }
            }

            // FINAL GUARD: 'name' is NOT NULL in cloud
            if (!payload.name) {
                payload.name = `Sale Tab ${op.entityId.substr(0, 4).toUpperCase()}`;
                console.warn(`[SyncEngine] Auto-repaired missing name for sales_tabs/${op.entityId}: ${payload.name}`);
            }
            // FINAL GUARD: 'user_id' is NOT NULL in cloud
            if (!payload.user_id) {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    payload.user_id = authUser.id;
                    console.warn(`[SyncEngine] Auto-repaired missing user_id for sales_tabs/${op.entityId}`);
                }
            }
        }

        // Hydration for Products (Required: name, price, category, sku)
        if (op.entity === 'products' && opType !== 'delete') {
            // AGGRESSIVE PATCH: Ensure variant_data and sku are correct even for stale queue items
            if ('variantData' in payload) {
                payload.variant_data = payload.variantData;
                delete payload.variantData;
            }
            if (!payload.sku) {
                payload.sku = op.entityId || payload.barcode_value || `SKU-${Date.now()}`;
            }

            if (!payload.name || payload.price === undefined || !payload.category || !payload.sku) {
                const local = await localDb.products.get(op.entityId);
                if (local) {
                    payload = {
                        ...payload,
                        name: payload.name || local.name,
                        sku: payload.sku || local.sku,
                        price: payload.price !== undefined ? payload.price : local.price,
                        category: payload.category || local.category
                    };
                }
            }
        }

        // Hydration for Customers (Required: name)
        if (op.entity === 'customers' && opType !== 'delete') {
            if (!payload.name) {
                const local = await localDb.customers.get(op.entityId);
                if (local) {
                    payload = {
                        ...payload,
                        name: payload.name || local.name
                    };
                }
            }
        }

        // Hydration for Suppliers (Required: name)
        if (op.entity === 'suppliers' && opType !== 'delete') {
            if (!payload.name) {
                const local = await localDb.suppliers.get(op.entityId);
                if (local) {
                    payload = {
                        ...payload,
                        name: payload.name || local.name
                    };
                }
            }
        }

        // Hydration for Product Batches (Required: batch_number)
        if (op.entity === 'product_batches' && opType !== 'delete') {
            if (!payload.batch_number || !payload.product_id) {
                const local = await localDb.productBatches.get(op.entityId);
                if (local) {
                    payload = {
                        ...payload,
                        batch_number: payload.batch_number || local.batchNumber,
                        product_id: payload.product_id || local.productId
                    };
                }
            }
            // FINAL GUARD: batch_number MUST NOT be null — auto-repair if still missing
            if (!payload.batch_number) {
                payload.batch_number = `B-REPAIR-${op.entityId.substr(0, 8).toUpperCase()}`;
                console.warn(`[SyncEngine] Auto-repaired null batch_number for ${op.entityId}: ${payload.batch_number}`);
                // Also patch local record so it's consistent
                await localDb.productBatches.update(op.entityId, { batchNumber: payload.batch_number });
            }
        }

        // --- PATCHING: Fix bad keys for legacy stuck queue items ---
        if (op.entity === 'stock_history' && opType !== 'delete') {
            if ('quantity' in payload && !payload.change_qty) { payload.change_qty = payload.quantity; delete payload.quantity; }
            if ('new_stock' in payload && !payload.balance_after) { payload.balance_after = payload.new_stock; delete payload.new_stock; }
            if ('newStock' in payload && !payload.balance_after) { payload.balance_after = payload.newStock; delete payload.newStock; }
            if ('notes' in payload) { payload.note = payload.notes; delete payload.notes; }
            delete payload.previous_stock;
            delete payload.previousStock;
            // Preserve type as-is — DB CHECK allows all types used locally
            // sale, purchase, stock_in, return, adjustment, initial, adjustment_out
            const VALID_TYPES = ['sale', 'purchase', 'stock_in', 'return', 'adjustment', 'initial', 'adjustment_out'];
            if (payload.type && !VALID_TYPES.includes(payload.type)) {
                // Map legacy types to valid ones (only for pre-migration data)
                if (payload.type.startsWith('adjustment')) payload.type = 'adjustment';
                else if (payload.type.includes('stock') || payload.type === 'Stock IN') payload.type = 'purchase';
                else payload.type = 'adjustment'; // fallback
            }
        }

        if (op.entity === 'product_batches' && opType !== 'delete') {
            if ('batchType' in payload) { payload.batch_type = payload.batchType; delete payload.batchType; }
            if ('supplierId' in payload) { payload.supplier_id = payload.supplierId; delete payload.supplierId; }
            if ('supplierName' in payload) { payload.supplier_name = payload.supplierName; delete payload.supplierName; }
            if ('supplier' in payload && !payload.supplier_name) { payload.supplier_name = payload.supplier; delete payload.supplier; }
            if ('supplierInfo' in payload) { payload.supplier_info = payload.supplierInfo; delete payload.supplierInfo; }
            if ('poId' in payload) { payload.po_id = payload.poId; delete payload.poId; }
            if ('updatedAt' in payload) { payload.updated_at = payload.updatedAt; delete payload.updatedAt; }
            delete payload.source;
        }

        if (op.entity === 'purchase_records' && opType !== 'delete') {
            if ('updatedAt' in payload) { payload.updated_at = payload.updatedAt; delete payload.updatedAt; }
            if (!payload.updated_at) { payload.updated_at = new Date().toISOString(); }
        }

        let error: any = null;

        try {
            // Specialized Logic for Settings (Singleton)
            if (op.entity === 'app_settings') {
                // Settings is a singleton. We always target the master ID.
                const { error: upsertError } = await supabase
                    .from('app_settings')
                    .upsert({ ...payload, id: SETTINGS_ID, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                
                if (upsertError) {
                    // Fallback: If upsert fails (e.g. unique constraint issues), try to update the first row found
                    const { data: firstRow } = await supabase.from('app_settings').select('id').limit(1).maybeSingle();
                    if (firstRow) {
                        const { error: updateError } = await supabase.from('app_settings').update(payload).eq('id', firstRow.id);
                        error = updateError;
                    } else {
                        error = upsertError;
                    }
                }
            }
            // Atomic RPC Operations (Note: RPC params usually cannot be filtered easily without introspection)
            else if (op.entity === 'sales' && opType === 'create') {
                // Safety net: if timestamp is null (legacy queued item), patch it
                if (!payload.timestamp) {
                    payload.timestamp = new Date().toISOString();
                }
                const result = await supabase.rpc('process_sale', { sale_data: payload });
                error = result.error;
            } else if (op.entity === 'sales' && opType === 'update' && payload.status === 'returned') {
                const result = await supabase.rpc('process_return', { sale_id: entityId, return_data: payload });
                error = result.error;
            } else if (op.entity === 'purchase_records' && opType === 'create') {
                // BYPASS process_stock_in RPC — the RPC contains a hardcoded reference to
                // 'supplier_id' column which does not exist in the remote schema.
                // Stock is managed locally; we just need to persist the record to the cloud.
                const cleanPayload = { ...payload };
                // Strip any local-only or non-existent remote columns
                delete cleanPayload.supplier_id;
                delete cleanPayload.supplierId;
                delete cleanPayload.retailPrice;
                delete cleanPayload.retail_price;
                delete cleanPayload.addedBy;
                delete cleanPayload.batches; // Not a column in purchase_records
                const result = await supabase
                    .from('purchase_records')
                    .upsert(cleanPayload, { onConflict: 'id' });
                error = result.error;
            }
            // Standard CRUD Fallback
            else if (opType === 'upsert' || opType === 'create') {
                // Basic conflict resolution: skip if remote has newer updated_at
                const conflictEntities = ['products', 'customers', 'suppliers', 'app_settings'];
                if (conflictEntities.includes(op.entity) && (opType === 'upsert' || opType === 'update')) {
                    const { data: remote } = await supabase
                        .from(table as any)
                        .select('updated_at')
                        .eq('id', entityId)
                        .maybeSingle();
                    if (remote?.updated_at) {
                        const localUpdatedAt = payload.updated_at || payload.updatedAt;
                        if (localUpdatedAt && new Date(localUpdatedAt).getTime() < new Date(remote.updated_at).getTime()) {
                            console.log(`[SyncEngine] Conflict: remote ${op.entity}/${entityId} is newer. Skipping local update.`);
                            return; // Remote is newer, skip
                        }
                    }
                }
                const result = await supabase.from(table as any).upsert(payload, { onConflict: 'id' });
                error = result.error;
            } else if (opType === 'update') {
                // Use upsert even for updates to ensure the record exists (self-healing for lost CREATE ops)
                // Basic conflict resolution: skip if remote has newer updated_at
                const conflictEntities = ['products', 'customers', 'suppliers', 'app_settings'];
                if (conflictEntities.includes(op.entity)) {
                    const { data: remote } = await supabase
                        .from(table as any)
                        .select('updated_at')
                        .eq('id', entityId)
                        .maybeSingle();
                    if (remote?.updated_at) {
                        const localUpdatedAt = payload.updated_at || payload.updatedAt;
                        if (localUpdatedAt && new Date(localUpdatedAt).getTime() < new Date(remote.updated_at).getTime()) {
                            console.log(`[SyncEngine] Conflict: remote ${op.entity}/${entityId} is newer. Skipping local update.`);
                            return; // Remote is newer, skip
                        }
                    }
                }
                const result = await supabase.from(table as any).upsert({ ...payload, id: entityId }, { onConflict: 'id' });
                error = result.error;
            } else if (opType === 'delete') {
                const result = await supabase.from(table as any).delete().eq('id', entityId);
                error = result.error;
            }

            // Success handling
            if (!error) return;

            // Handle duplicate key error (409 Conflict / 23505) gracefully
            const errStr = (JSON.stringify(error) + (error.message || '')).toLowerCase();
            const isDuplicate = error.code === '23505' || (error.code === '409' && !errStr.includes('foreign key'));
            
            if (isDuplicate || errStr.includes('duplicate key') || errStr.includes('unique constraint')) {
                // SPECIAL CASE: Invoice Number Collision
                if (op.entity === 'sales' && opType === 'create' && errStr.includes('invoice_number')) {
                    console.warn(`[SyncEngine] Invoice collision detected for ${entityId}. Fetching fresh number from cloud...`);
                    try {
                        const { data, error: rpcError } = await supabase.rpc('get_next_invoice_number');
                        if (!rpcError && data?.invoiceNumber) {
                            const newInvoiceNumber = data.invoiceNumber;
                            const updatedPayload = { ...payload, invoice_number: newInvoiceNumber };
                            
                            // Update local record so it matches the cloud (otherwise local reports won't match cloud)
                            await localDb.sales.update(entityId, { invoiceNumber: newInvoiceNumber });
                            
                            // Update pending op payload and retry immediately
                            await localDb.pendingOps.update(op.id!, { payload: updatedPayload });
                            console.log(`[SyncEngine] Re-assigned invoice ${newInvoiceNumber} to sale ${entityId}. Retrying...`);
                            throw new Error('RETRY_WITH_NEW_INVOICE');
                        }
                    } catch (e) {
                        if (e.message === 'RETRY_WITH_NEW_INVOICE') throw e;
                        console.error('[SyncEngine] Failed to resolve invoice collision:', e);
                    }
                }

                console.log(`[SyncEngine] Conflict resolved: Item already exists in cloud based on unique constraint (already synced).`);
                return; // Treat as success to remove from queue
            }


                
                // Auto-drop truly orphaned records (where parent is unlikely to appear)
                // ONLY drop if it's a Foreign Key violation (23503)
                if ((error.code === '23503' || errStr.includes('foreign key')) && 
                    (op.entity === 'product_batches' || op.entity === 'stock_history' || op.entity === 'purchase_records')) {
                    console.warn(`[SyncEngine] Flagging orphaned ${op.entity} (ID: ${entityId}) as error (FK Violation).`);
                    if (op.id) await localDb.pendingOps.update(op.id, { 
                        status: 'error', 
                        errorMessage: `Orphaned record: Parent ${op.entity === 'product_batches' ? 'Product' : 'Sale'} not found in cloud.` 
                    });
                    return; 
                }

                // Permanent Fix: Auto-nullify or re-assign missing foreign keys to unblock the queue
                const possibleFKs = [
                    { key: 'user_id', camel: 'userId', action: 'current_user' },
                    { key: 'customer_id', camel: 'customerId', action: 'null' },
                    { key: 'selected_customer_id', camel: 'selectedCustomerId', action: 'null' }
                ];
                
                let healed = false;
                for (const fk of possibleFKs) {
                    if (errStr.includes(fk.key)) {
                        let newValue = null;
                        if (fk.action === 'current_user') {
                            const { data: { session } } = await supabase.auth.getSession();
                            newValue = session?.user?.id || null;
                            console.warn(`[SyncEngine] FK failed on ${fk.key} for ${op.entity}. Re-assigning to current user ${newValue}.`);
                        } else {
                            console.warn(`[SyncEngine] FK failed on ${fk.key} for ${op.entity}. Nullifying to unblock sync.`);
                        }
                        
                        const updatedPayload = { ...op.payload, [fk.key]: newValue };
                        if (fk.camel in updatedPayload) updatedPayload[fk.camel] = newValue;
                        
                        if (op.id) {
                            await localDb.pendingOps.update(op.id, { payload: updatedPayload });
                        }
                        healed = true;
                    }
                }
                
                // Specific drop for users referencing auth.users that don't exist
                if (op.entity === 'users' && errStr.includes('users_id_fkey')) {
                    console.warn(`[SyncEngine] Dropping orphaned user ${entityId} because auth.users record is missing.`);
                    return; // Treat as success to drop from queue
                }
                
                if (healed) throw error; // Throw so it retries on the next tick with the nullified/re-assigned payload

            // RPC Missing Error (PGRST202 or 404 with missing function message)
            if (error.code === 'PGRST202' || errStr.includes('Could not find the function')) {
                console.error(`[SyncEngine] CRITICAL: Missing Supabase RPC function for ${op.entity}. ` +
                    `Please run the SQL setup script (supabase_rpc_setup.sql) in your Supabase SQL Editor.`);
                throw new Error(`MISSING_BACKEND_FUNCTION: '${op.entity}' RPC required.`);
            }

            // PostgREST Invalid Data Errors (e.g. string "normal" into numeric column)
            // Code 22P02: invalid input syntax for type. Code 22003: numeric value out of range.
            if (error.code === '22P02' || error.code === '22003' || errStr.includes('invalid input syntax')) {
                console.error(`[SyncEngine] CRITICAL DATA TYPE ERROR: entity=${op.entity} error=${error.message} details=${JSON.stringify(error.details)} payload=${JSON.stringify(payload).slice(0, 500)}`);
                if (op.id) await localDb.pendingOps.delete(op.id);
                return;
            }

            // Error Assessment: Is it a missing column error?
            if (recordBlacklistedColumn(op.entity, error.message || "")) {
                schemaRetries++;
                console.log(`[SyncEngine] Schema mismatch resolved. Retrying attempt ${schemaRetries}/${MAX_SCHEMA_RETRIES}...`);
                continue; // Loop again with the newly filtered payload
            }

            // If it's not a schema error, throw it to the outer handler
            throw error;

        } catch (e: any) {
            // Re-check schema errors in case of throw from recordBlacklistedColumn logic
            if (recordBlacklistedColumn(op.entity, e.message || "")) {
                schemaRetries++;
                continue;
            }
            throw e;
        }
    }

    throw new Error(`Exceeded maximum schema discovery retries (${MAX_SCHEMA_RETRIES}) for entity: ${op.entity}`);
}


function scheduleOfflineRetry() {
    if (_offlineTimer) return;
    const delay = _offlineBackoff > 0 ? _offlineBackoff : BACKOFF_INITIAL;
    console.log(`[POS SYNC] Scheduling retry in ${delay}ms (backoff: ${_offlineBackoff}ms)`);
    _offlineTimer = setTimeout(() => {
        _offlineTimer = null;
        if (navigator.onLine) {
            _offlineBackoff = 0;
            _offlineMode = false;
            syncToCloud().catch(() => {});
        } else {
            // Still offline — double backoff and reschedule
            _offlineBackoff = Math.min((_offlineBackoff || BACKOFF_INITIAL) * 2, BACKOFF_MAX);
            scheduleOfflineRetry();
        }
    }, delay);
}

export async function syncToCloud(options: { resetRetries?: boolean } = {}) {
    // OFFLINE MODE GATE: if _offlineMode is set, we had a prior network failure
    // and are waiting for the online event to resume.
    if (_offlineMode) {
        console.log('[POS SYNC] Offline mode active — waiting for online event to resume.');
        return;
    }

    // SECURITY GUARD #1: Never call getSession() when offline — it triggers
    // Supabase's internal retry loop even though the cached session is returned.
    if (!navigator.onLine) {
        scheduleOfflineRetry();
        return;
    }

    // SECURITY GUARD #2: Never sync if no user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || _isSyncing) {
        if (_isSyncing) _syncNeeded = true;
        return;
    }

    // BACKOFF GATE: skip if exponential backoff is active
    if (_offlineBackoff > 0) {
        console.log(`[POS SYNC] Backoff active (${_offlineBackoff}ms) — deferring.`);
        scheduleOfflineRetry();
        return;
    }

    _isSyncing = true;
    _syncNeeded = false;

    // Sync timeout wrapper
    let syncTimedOut = false;
    const syncTimeout = setTimeout(() => {
        syncTimedOut = true;
        console.warn('[POS SYNC] Sync timed out after 120s — entering offline mode.');
        _offlineMode = true;
        _isSyncing = false;
    }, SYNC_TIMEOUT);

    try {
        if (options.resetRetries) {
            console.log('[POS SYNC] Resetting all retry counters...');
            await localDb.pendingOps.toCollection().modify({ retries: 0, status: 'pending' });
            window.dispatchEvent(new Event('pendingops-changed'));
        }

        while (true) {
            if (syncTimedOut) return;
            const pending = await localDb.pendingOps.toArray();

            if (pending.length === 0) {
                if (_syncNeeded) {
                    _syncNeeded = false;
                    continue;
                }
                break;
            }

            const processableItems = pending.filter(op => op.status !== 'error' && (op.retries || 0) < 10);

            if (processableItems.length === 0) {
                if (_syncNeeded) {
                    _syncNeeded = false;
                    continue;
                }
                break;
            }

            // Ensure sync order to prevent foreign key constraint issues (products first, then dependent entities)
            processableItems.sort((a, b) => {
                const getPriority = (entity: string) => {
                    if (entity === 'products') return 1;
                    return 2; // sales, expenses, etc.
                };
                return getPriority(a.entity) - getPriority(b.entity) || a.createdAt - b.createdAt;
            });

            for (const op of processableItems) {
                // Double check it still exists (might have been deleted by another process)
                const exists = await localDb.pendingOps.get(op.id!);
                if (!exists) continue;

                console.log(`[POS SYNC] ${op.opType.toUpperCase()}: ${op.entity} (ID: ${op.entityId})`);

                try {
                    await executeOp(op);
                    
                    // Only delete from pendingOps if it wasn't marked as 'error' inside executeOp
                    const finalOp = await localDb.pendingOps.get(op.id!);
                    if (finalOp && finalOp.status !== 'error') {
                        console.log(`[POS SYNC] SUCCESS: ${op.entity}/${op.entityId}`);
                        await localDb.pendingOps.delete(op.id!);

                        // ── POST-SYNC CACHE REFRESH ──
                        // After successful sync of key entities, fetch the latest version
                        // from cloud and update localDb to prevent stale cache issues.
                        // This is fire-and-forget — sync success is not dependent on it.
                        if (op.opType !== 'delete' && ['products', 'customers', 'suppliers'].includes(op.entity)) {
                            const tableMap: Record<string, string> = { products: 'products', customers: 'customers', suppliers: 'suppliers' };
                            const table = tableMap[op.entity];
                            if (table) {
                                supabase.from(table).select('*').eq('id', op.entityId).maybeSingle()
                                    .then(({ data }) => {
                                        if (data) {
                                            const localTable = op.entity === 'products' ? localDb.products
                                                : op.entity === 'customers' ? localDb.customers
                                                : localDb.suppliers;
                                            (localTable as any).put(data).catch(() => {});
                                        }
                                    })
                                    .catch(() => {}); // Non-critical, best-effort
                            }
                        }
                    } else if (finalOp?.status === 'error') {
                        console.warn(`[POS SYNC] STOPPED: ${op.entity}/${op.entityId} has permanent error. Stays in queue but will not retry.`);
                    }

                    await localDb.syncHistory.add({
                        timestamp: Date.now(),
                        itemsSynced: 1,
                        entities: [op.entity],
                        status: 'success'
                    });

                    window.dispatchEvent(new Event('pendingops-changed'));
                } catch (err: any) {
                    const errorMsg = err.message || JSON.stringify(err);
                    console.error(`[POS SYNC] ERROR: ${op.entity}/${op.entityId}`, errorMsg);

                    // Check for network errors - if offline, don't increment retries or mark as failed
                    const isNetworkError = !navigator.onLine || 
                                         errorMsg.toLowerCase().includes('fetch') || 
                                         errorMsg.toLowerCase().includes('networkerror') ||
                                         errorMsg.toLowerCase().includes('disconnected') ||
                                         errorMsg.toLowerCase().includes('quic') ||
                                         errorMsg.toLowerCase().includes('load resource');

                    if (isNetworkError) {
                        console.warn('[POS SYNC] Network issue detected, pausing sync queue.');
                        _offlineMode = true;
                        _offlineBackoff = Math.min((_offlineBackoff || BACKOFF_INITIAL) * 2, BACKOFF_MAX);
                        _isSyncing = false;
                        scheduleOfflineRetry();
                        return;
                    }

                    // Reset backoff on non-network errors (server responded)
                    _offlineBackoff = 0;

                    // Only increment retries for real API/Logic errors
                    const newRetries = (op.retries || 0) + 1;
                    const status = newRetries >= 10 ? 'error' : 'failed';

                    await localDb.pendingOps.update(op.id!, {
                        retries: newRetries,
                        status,
                        lastError: errorMsg
                    });

                    window.dispatchEvent(new Event('pendingops-changed'));
                }
            }
        }

        // Reset backoff and offline mode on successful sync cycle
        clearTimeout(syncTimeout);
        _offlineBackoff = 0;
        _offlineMode = false;
        if (_offlineTimer) {
            clearTimeout(_offlineTimer);
            _offlineTimer = null;
        }
        // Confirm queue is truly empty before logging completion
        const remainingAfterSync = await localDb.pendingOps.count();
        if (remainingAfterSync === 0) {
            console.log('✅ Full Sync Complete.');
        } else {
            console.log(`📋 Sync cycle finished (${remainingAfterSync} pending ops remain).`);
        }
        await updateSyncTime();
        // Supabase is reachable (sync succeeded) — re-enable full auth init
        enableFullAuthInit();
    } finally {
        clearTimeout(syncTimeout);
        _isSyncing = false;
    }
}

async function autoRecoverErrors() {
    const errorOps = await localDb.pendingOps.where('status').equals('error').toArray();
    let recoveredCount = 0;
    
    for (const op of errorOps) {
        // Check for permanent errors
        const isPermanent = op.errorMessage?.includes('Orphaned record') || 
                            op.errorMessage?.includes('Permission Denied') ||
                            op.lastError?.includes('foreign key constraint') ||
                            op.lastError?.includes('rls policy');
                            
        // We use a custom field in the record if it doesn't exist, to track auto recoveries
        const autoRetryCount = (op as any).autoRetryCount || 0;
        
        if (!isPermanent && autoRetryCount < 3) {
            await localDb.pendingOps.update(op.id!, {
                status: 'pending',
                retries: 0,
                autoRetryCount: autoRetryCount + 1
            });
            recoveredCount++;
        }
    }
    
    if (recoveredCount > 0) {
        console.log(`[POS SYNC] Auto-recovered ${recoveredCount} errored ops.`);
        window.dispatchEvent(new Event('pendingops-changed'));
        syncToCloud().catch(() => {});
    }
}

/**
 * Removes pending ops older than 7 days and enforces a hard size cap.
 */
async function pruneStaleOps() {
    const sevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const stale = await localDb.pendingOps.where('createdAt').below(sevenDays).delete();
    if (stale > 0) {
        console.log(`[POS SYNC] Pruned ${stale} stale pending ops (older than 7 days).`);
        window.dispatchEvent(new Event('pendingops-changed'));
    }
    const count = await localDb.pendingOps.count();
    if (count > 800) {
        // If still over 800, remove oldest until under 500
        const excess = count - 500;
        const oldest = await localDb.pendingOps.orderBy('createdAt').limit(excess).toArray();
        const idsToDelete = oldest.map(o => o.id).filter(Boolean) as number[];
        if (idsToDelete.length > 0) {
            await localDb.pendingOps.bulkDelete(idsToDelete);
            console.log(`[POS SYNC] Hard-capped queue from ${count} to ${count - idsToDelete.length} items.`);
            window.dispatchEvent(new Event('pendingops-changed'));
        }
    }
}

async function pruneOldStockHistory() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const all = await localDb.stockHistory.toArray();
    const old = all.filter(h => h.createdAt && new Date(h.createdAt).getTime() < ninetyDaysAgo.getTime());
    if (old.length > 0) {
        await localDb.stockHistory.bulkDelete(old.map(h => h.id));
        console.log(`[POS MAINT] Pruned ${old.length} stock history entries older than 90 days.`);
    }
    const remaining = await localDb.stockHistory.count();
    if (remaining > 10000) {
        const sorted = all
            .filter(h => !old.find(o => o.id === h.id))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const excess = sorted.slice(0, Math.min(sorted.length - 5000, sorted.length));
        if (excess.length > 0) {
            await localDb.stockHistory.bulkDelete(excess.map(h => h.id));
            console.log(`[POS MAINT] Hard-capped stock history to 5000 items (removed ${excess.length}).`);
        }
    }
}

export function startSyncEngine() {
    clearBlacklist();
    pruneStaleOps();
    pruneOldStockHistory();
    syncToCloud().catch(() => { });

    window.addEventListener('online', () => {
        console.log('[POS SYNC] Online event — resetting backoff and retrying immediately.');
        _offlineBackoff = 0;
        _offlineMode = false;
        if (_offlineTimer) {
            clearTimeout(_offlineTimer);
            _offlineTimer = null;
        }
        autoRecoverErrors();
        syncToCloud({ resetRetries: true }).catch(() => { });
    });

    window.addEventListener('offline', () => {
        console.log('[POS SYNC] Offline event — scheduling backoff retry.');
        scheduleOfflineRetry();
        window.dispatchEvent(new Event('pendingops-changed'));
    });

    // 10-minute auto-recovery timer
    setInterval(() => {
        if (navigator.onLine) {
            autoRecoverErrors();
            pruneStaleOps();
            pruneOldStockHistory();
        }
    }, 10 * 60 * 1000);

    setInterval(() => {
        if (navigator.onLine && _offlineBackoff === 0) {
            syncToCloud().catch(() => { });
        }
    }, HEARTBEAT_INTERVAL);
}

export const syncNow = syncToCloud;

/**
 * Resets all failed/error items back to 'pending' and starts sync
 */
export async function retrySyncAll() {
    await localDb.pendingOps.toCollection().modify({
        status: 'pending',
        retries: 0
    });
    _offlineMode = false;
    _offlineBackoff = 0;
    if (_offlineTimer) {
        clearTimeout(_offlineTimer);
        _offlineTimer = null;
    }
    window.dispatchEvent(new Event('pendingops-changed'));
    return syncToCloud();
}

/**
 * Removes all items from the queue that have failed 5+ times
 */
export async function clearStuckOps() {
    await localDb.pendingOps.where('retries').aboveOrEqual(10).delete();
    window.dispatchEvent(new Event('pendingops-changed'));
}
