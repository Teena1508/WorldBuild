-- WORLDBUILD: Migration 005 - Stories, Series, Manuscript Imports, Publishing Foundation & Reading Community Schema

-- 1. Series Table for multi-book sagas and sequence organization
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT series_title_not_empty CHECK (char_length(title) > 0)
);

CREATE INDEX IF NOT EXISTS idx_series_user ON series(user_id);

-- 2. Stories Table for standalone or universe-linked manuscripts
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  series_id TEXT REFERENCES series(id) ON DELETE SET NULL,
  series_order INTEGER,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  author_notes TEXT DEFAULT '',
  is_example BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT stories_title_not_empty CHECK (char_length(title) > 0),
  CONSTRAINT chk_story_status CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_series ON stories(series_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);

-- 3. Story - Universe Many-to-Many Linking
CREATE TABLE IF NOT EXISTS story_universes (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (story_id, universe_id)
);

CREATE INDEX IF NOT EXISTS idx_su_story ON story_universes(story_id);
CREATE INDEX IF NOT EXISTS idx_su_universe ON story_universes(universe_id);

-- 4. Enhance Chapters Table with story association and author notes
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS story_id TEXT REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS author_notes TEXT DEFAULT '';
ALTER TABLE chapters ALTER COLUMN universe_id DROP NOT NULL;

-- In a multi-story world, chapters have unique sequence numbers per story.
-- Drop the legacy universe-only constraint and add story-scoped sequence uniqueness
ALTER TABLE chapters DROP CONSTRAINT IF EXISTS uq_chapter_sequence;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_chapter_story_sequence') THEN
    ALTER TABLE chapters ADD CONSTRAINT uq_chapter_story_sequence UNIQUE (story_id, sequence_number);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_universe_legacy_sequence
  ON chapters (universe_id, sequence_number)
  WHERE story_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chapters_story ON chapters(story_id);
CREATE INDEX IF NOT EXISTS idx_chapters_story_seq ON chapters(story_id, sequence_number);

-- 5. Manuscript Imports Tracking & Duplicate Detection
CREATE TABLE IF NOT EXISTS manuscript_imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'previewed',
  metadata_json TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_mi_status CHECK (status IN ('previewed', 'imported', 'failed')),
  CONSTRAINT chk_mi_file_type CHECK (file_type IN ('text', 'markdown', 'docx'))
);

CREATE INDEX IF NOT EXISTS idx_mi_user ON manuscript_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_mi_content_hash ON manuscript_imports(user_id, content_hash);

-- 6. Publishing Foundation (Milestone 3 preparation)
CREATE TABLE IF NOT EXISTS published_stories (
  id TEXT PRIMARY KEY,
  story_id TEXT UNIQUE NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  public_title TEXT NOT NULL,
  public_description TEXT DEFAULT '',
  cover_url TEXT,
  genres TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_pub_status CHECK (status IN ('published', 'unpublished'))
);

CREATE INDEX IF NOT EXISTS idx_pub_stories_status ON published_stories(status);
CREATE INDEX IF NOT EXISTS idx_pub_stories_author ON published_stories(author_id);

CREATE TABLE IF NOT EXISTS published_chapter_snapshots (
  id TEXT PRIMARY KEY,
  published_story_id TEXT NOT NULL REFERENCES published_stories(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_pub_chapter_version UNIQUE (published_story_id, chapter_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_pub_chap_story ON published_chapter_snapshots(published_story_id);

CREATE TABLE IF NOT EXISTS author_profiles (
  user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  pen_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Reading Community Schema Foundation (Milestone 5 preparation)
CREATE TABLE IF NOT EXISTS story_bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  published_story_id TEXT NOT NULL REFERENCES published_stories(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_story_bookmark UNIQUE (user_id, published_story_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  published_story_id TEXT NOT NULL REFERENCES published_stories(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_chapter_progress UNIQUE (user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS author_follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_follower_author UNIQUE (follower_id, author_id),
  CONSTRAINT chk_no_self_follow CHECK (follower_id <> author_id)
);
