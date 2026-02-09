-- Migration: V3.1 Canonical Hash & Indexes
-- Description: Adds canonical_json_sha256 column and indexes for export performance.

-- 1. Add Column
ALTER TABLE public.ingested_events
  ADD COLUMN IF NOT EXISTS canonical_json_sha256 text;

-- 2. Add Indexes
-- Index for looking up events by raw_body_sha256 within a workspace (for exports/dedupe checks)
CREATE INDEX IF NOT EXISTS idx_ingested_events_workspace_raw_hash
  ON public.ingested_events(workspace_id, raw_body_sha256);

-- Index for looking up events by canonical_json_sha256 within a workspace
CREATE INDEX IF NOT EXISTS idx_ingested_events_workspace_canonical_hash
  ON public.ingested_events(workspace_id, canonical_json_sha256);
