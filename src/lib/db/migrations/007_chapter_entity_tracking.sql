-- WORLDBUILD: Migration 007 - Automatic Chapter Entity & Lore Tracking
-- Adds aliases to characters and locations, and creates chapter_entity_links table

-- 1. Support aliases on characters and locations (idempotent exception-safe blocks)
DO $$
BEGIN
  BEGIN
    ALTER TABLE characters ADD COLUMN aliases TEXT DEFAULT '';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
  BEGIN
    ALTER TABLE locations ADD COLUMN aliases TEXT DEFAULT '';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
END $$;

-- 2. Create chapter_entity_links table
CREATE TABLE IF NOT EXISTS chapter_entity_links (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
  character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('character', 'location', 'event', 'lore_object', 'unknown')),
  entity_id TEXT,
  entity_name TEXT NOT NULL,
  matched_alias TEXT,
  relationship_type TEXT NOT NULL DEFAULT 'appears' CHECK (relationship_type IN ('appears', 'mentioned', 'setting', 'participates', 'referenced')),
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('confirmed', 'detected', 'needs_review', 'dismissed')),
  source TEXT NOT NULL DEFAULT 'deterministic' CHECK (source IN ('deterministic', 'local_ai', 'author_confirmed', 'manual')),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000,
  mention_count INTEGER NOT NULL DEFAULT 1,
  passage TEXT,
  passage_reference TEXT,
  positions_json TEXT NOT NULL DEFAULT '[]',
  author_notes TEXT,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_chapter_entity_fp UNIQUE (chapter_id, fingerprint)
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_cel_chapter ON chapter_entity_links(chapter_id);
CREATE INDEX IF NOT EXISTS idx_cel_universe ON chapter_entity_links(universe_id);
CREATE INDEX IF NOT EXISTS idx_cel_char ON chapter_entity_links(character_id);
CREATE INDEX IF NOT EXISTS idx_cel_loc ON chapter_entity_links(location_id);
CREATE INDEX IF NOT EXISTS idx_cel_event ON chapter_entity_links(event_id);
CREATE INDEX IF NOT EXISTS idx_cel_type ON chapter_entity_links(universe_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_cel_status ON chapter_entity_links(chapter_id, status);
CREATE INDEX IF NOT EXISTS idx_cel_entity_name ON chapter_entity_links(universe_id, entity_name);
