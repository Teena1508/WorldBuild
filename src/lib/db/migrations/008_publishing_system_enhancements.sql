-- WORLDBUILD: Migration 008 - Publishing System Enhancements
-- Adds unique slugs, publication versioning, active snapshot indicators, and cover storage support.

-- 1. Add slug and publication versioning to published_stories
ALTER TABLE published_stories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE published_stories ADD COLUMN IF NOT EXISTS publication_version INTEGER NOT NULL DEFAULT 1;

-- Ensure unique slug constraint on published_stories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_published_stories_slug') THEN
    ALTER TABLE published_stories ADD CONSTRAINT uq_published_stories_slug UNIQUE (slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pub_stories_slug ON published_stories(slug);

-- 2. Add draft metadata to stories table (genres, tags, custom slug)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS genres TEXT DEFAULT '';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '';

-- 3. Enhance published_chapter_snapshots with is_current flag for atomic snapshot switching
ALTER TABLE published_chapter_snapshots ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pub_chap_current ON published_chapter_snapshots(published_story_id, is_current, sequence_number);
CREATE INDEX IF NOT EXISTS idx_pub_chap_chapter ON published_chapter_snapshots(chapter_id, is_current);
