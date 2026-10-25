-- WORLDBUILD: Migration 003 - Story Studio & Chapter Manuscript Analysis
-- Adds manuscript content, versioning for optimistic concurrency control, and persistent analysis findings.

-- 1. Enhance chapters table with manuscript content, word count, version, and status
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS word_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

-- 2. Create chapter_analysis_findings table for canon & local AI plot-hole findings
CREATE TABLE IF NOT EXISTS chapter_analysis_findings (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  chapter_version INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  passage TEXT,
  passage_reference TEXT,
  conflicting_canon TEXT,
  explanation TEXT NOT NULL,
  suggested_fix TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.850,
  status TEXT NOT NULL DEFAULT 'open',
  dismissal_reason TEXT,
  author_notes TEXT,
  source TEXT NOT NULL DEFAULT 'local_ai',
  fingerprint TEXT NOT NULL,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_chapter_finding_fp UNIQUE (chapter_id, fingerprint),
  CONSTRAINT chk_caf_status CHECK (status IN ('open', 'accepted', 'dismissed', 'resolved')),
  CONSTRAINT chk_caf_source CHECK (source IN ('deterministic_rule', 'local_ai')),
  CONSTRAINT chk_caf_severity CHECK (severity IN ('critical', 'high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_caf_chapter ON chapter_analysis_findings(chapter_id);
CREATE INDEX IF NOT EXISTS idx_caf_universe ON chapter_analysis_findings(universe_id);
CREATE INDEX IF NOT EXISTS idx_caf_status ON chapter_analysis_findings(chapter_id, status);
CREATE INDEX IF NOT EXISTS idx_caf_stale ON chapter_analysis_findings(chapter_id, is_stale);
