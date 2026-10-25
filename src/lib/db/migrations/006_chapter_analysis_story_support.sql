-- Migration 006: Support Story-level Chapter Continuity Analysis
-- Relaxes universe_id constraint on chapter_analysis_findings and links to stories

ALTER TABLE chapter_analysis_findings ADD COLUMN IF NOT EXISTS story_id TEXT REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE chapter_analysis_findings ALTER COLUMN universe_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_caf_story ON chapter_analysis_findings(story_id);
