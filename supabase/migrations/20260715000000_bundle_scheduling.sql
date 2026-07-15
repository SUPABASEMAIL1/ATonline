-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Bundle / Deal Scheduling
-- Adds date range, repeat days, and daily time window to bundles for timed deals
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE bundles
  ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'always' CHECK (schedule_type IN ('always', 'scheduled')),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS repeat_days TEXT[],
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;
