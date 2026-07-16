-- Fix Categories: Parse raw JSON names, deduplicate, and enable visibility
--
-- Problem: Some category rows have the entire object JSON-stringified into the
-- `name` column (e.g. '{"id":"...","name":"Pizzas","description":"..."}').
-- Duplicates exist for Pizzas, Special Pizzas, and Beverages.
-- Products reference categories by the `category` TEXT column (store name, not ID).
--
-- Fix strategy:
-- 1. For each corrupted row (name starts with '{'), parse JSON and extract clean values.
-- 2. Deduplicate: keep the earliest-created row per clean name, delete others.
-- 3. Set estore_sort_order for the pizza categories to control display order.

BEGIN;

-- Step 1: Create a temp table of parsed values for corrupted rows
WITH corrupted AS (
  SELECT
    id,
    name,
    (name::json->>'name')::text AS clean_name,
    (name::json->>'description')::text AS clean_description,
    created_at
  FROM categories
  WHERE name LIKE '{%'
),
-- Step 2: For each clean_name, pick the earliest row to keep
deduped AS (
  SELECT DISTINCT ON (clean_name)
    id AS keep_id,
    clean_name,
    clean_description
  FROM corrupted
  ORDER BY clean_name, created_at ASC
),
-- Step 3: Update the kept rows with parsed name + description
updated AS (
  UPDATE categories c
  SET
    name = d.clean_name,
    description = d.clean_description,
    updated_at = NOW()
  FROM deduped d
  WHERE c.id = d.keep_id
  RETURNING c.id, c.name
),
-- Step 4: Delete duplicate corrupted rows (same clean_name, different id)
deleted AS (
  DELETE FROM categories c
  WHERE c.name LIKE '{%'
    AND c.id NOT IN (SELECT keep_id FROM deduped)
  RETURNING c.id
)
-- Step 5: Report results
SELECT
  (SELECT COUNT(*) FROM updated) AS rows_updated,
  (SELECT COUNT(*) FROM deleted) AS rows_deleted;

-- Step 6: Ensure pizza categories are visible + have sort order
UPDATE categories
SET
  estore_sort_order = CASE
    WHEN LOWER(name) = 'special pizzas' THEN 1
    WHEN LOWER(name) = 'pizzas' THEN 2
    WHEN LOWER(name) = 'beverages' THEN 3
    WHEN LOWER(name) = 'general' THEN 99
    ELSE 0
  END,
  updated_at = NOW()
WHERE name IN ('Special Pizzas', 'Pizzas', 'Beverages', 'General');

COMMIT;
