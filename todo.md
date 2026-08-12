# ✅ DONE: Permanent Fixes (Cross-Device Conflict + Variant Restock)

## ✅ Research — complete

## #1 Cross-Device Stale-Write Rejection (F21 — PERMANENT, server-enforced) ✅
- [x] Migration `20260812180000_stale_write_guards_variant_restock.sql` — row_tombstones + guard_stale_write (P0007) + record_row_tombstone on 8 financial tables + updated_at preserve
- [x] Master schema synced (main + post-launch blocks)
- [x] syncEngine: P0007 → op drop + cloud-refresh (retry impossible)
- [x] LMS LIVE TEST 4/4 PASS (JeanZone prod, zero residue): stale-update rejected, fresh accepted, resurrect blocked, fresh insert OK
- [x] Deployed + VERIFIED all 4 projects (24 triggers each, 2 variant cols, tombstone table)

## #2 Variant Restock (F22 — PERMANENT) ✅
- [x] purchase_records.variant_id/variant_label (schema + mapper + type)
- [x] purchaseRecordsService.create/delete variant ledger (shared applyVariantStockMovement)
- [x] stockInCommit helper variant passthrough
- [x] BatchStockInSystem refactored onto shared helper + variant selector column
- [x] ProductDetailHub variant stock edit → adjustment delta entries (silent-loss fixed)

## Deploy & Docs ✅
- [x] tsc + build clean
- [x] Master schema pushed + verified all 4 projects via Management API (env_backups tokens)
- [x] GEMINI.md (F21/F22 rules + changelog), AGENTS.md (F21/F22), setup.md (F21/F22 + NEW CLONE auto-install section + migration log)

## ⏳ Remaining (user action)
- [ ] Code push to 4 repos (jeanzone, atonline, minimahalpos, pizzamilano) + GH Actions verify