-- WORLDBUILD: Initial Normalized PostgreSQL Schema Migration (001)
-- Supports Universes, Characters, Locations, Chapters, Events, Dependencies,
-- Relationships, Secrets, Character-Secret Knowledge, and Continuity Oracle Findings.

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS universes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cover_url TEXT,
  is_example BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT universes_title_not_empty CHECK (char_length(title) > 0)
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  realm TEXT NOT NULL,
  description TEXT NOT NULL,
  coordinates_x INTEGER,
  coordinates_y INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_location_name UNIQUE (universe_id, name),
  CONSTRAINT locations_name_not_empty CHECK (char_length(name) > 0)
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_chapter_sequence UNIQUE (universe_id, sequence_number),
  CONSTRAINT chapters_seq_positive CHECK (sequence_number >= 0)
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  epithet TEXT,
  bio TEXT NOT NULL,
  birth_year INTEGER,
  death_year INTEGER,
  death_confirmed BOOLEAN NOT NULL DEFAULT false,
  death_exception_notes TEXT,
  status TEXT NOT NULL DEFAULT 'alive',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_character_name UNIQUE (universe_id, name),
  CONSTRAINT characters_name_not_empty CHECK (char_length(name) > 0),
  CONSTRAINT characters_status_check CHECK (status IN ('alive', 'deceased', 'ascended', 'displaced', 'unknown'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sequence_number INTEGER NOT NULL DEFAULT 0,
  timestamp_year INTEGER NOT NULL,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  is_death_event BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT events_title_check CHECK (char_length(title) > 0),
  CONSTRAINT events_sequence_number_check CHECK (sequence_number >= 0)
);

CREATE TABLE IF NOT EXISTS event_participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role TEXT,
  notes TEXT,
  CONSTRAINT uq_event_character UNIQUE (event_id, character_id)
);

CREATE TABLE IF NOT EXISTS event_dependencies (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  predecessor_event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'requires_predecessor',
  CONSTRAINT uq_event_dependency UNIQUE (event_id, predecessor_event_id),
  CONSTRAINT event_dependencies_dependency_type_check CHECK (
    dependency_type IN ('requires_predecessor', 'causal', 'chronological')
  )
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  source_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  intensity INTEGER NOT NULL DEFAULT 5,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_character_pair_type UNIQUE (source_character_id, target_character_id, relationship_type),
  CONSTRAINT chk_no_self_relationship CHECK (source_character_id <> target_character_id),
  CONSTRAINT relationships_relationship_type_check CHECK (char_length(relationship_type) > 0),
  CONSTRAINT relationships_intensity_check CHECK (intensity >= 1 AND intensity <= 10)
);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'major',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT secrets_title_check CHECK (char_length(title) > 0),
  CONSTRAINT secrets_content_check CHECK (char_length(content) > 0),
  CONSTRAINT secrets_severity_check CHECK (severity IN ('minor', 'major', 'cosmic', 'forbidden'))
);

CREATE TABLE IF NOT EXISTS character_secrets (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  learned_at_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  learned_year INTEGER,
  notes TEXT,
  CONSTRAINT uq_character_secret UNIQUE (character_id, secret_id)
);

CREATE TABLE IF NOT EXISTS secret_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  usage_type TEXT NOT NULL DEFAULT 'used',
  CONSTRAINT uq_event_secret_character UNIQUE (event_id, secret_id, character_id, usage_type),
  CONSTRAINT secret_events_usage_type_check CHECK (usage_type IN ('used', 'revealed', 'referenced'))
);

CREATE TABLE IF NOT EXISTS continuity_findings (
  id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  affected_entities_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_universe_fingerprint UNIQUE (universe_id, fingerprint),
  CONSTRAINT continuity_findings_rule_code_check CHECK (char_length(rule_code) > 0),
  CONSTRAINT continuity_findings_finding_type_check CHECK (finding_type IN ('violation', 'warning')),
  CONSTRAINT continuity_findings_severity_check CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT continuity_findings_status_check CHECK (status IN ('open', 'resolved', 'ignored'))
);

-- Essential Performance Indexes
CREATE INDEX IF NOT EXISTS idx_universes_user ON universes(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_universe ON characters(universe_id);
CREATE INDEX IF NOT EXISTS idx_locations_universe ON locations(universe_id);
CREATE INDEX IF NOT EXISTS idx_chapters_universe ON chapters(universe_id);
CREATE INDEX IF NOT EXISTS idx_events_universe ON events(universe_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(universe_id, timestamp_year);
CREATE INDEX IF NOT EXISTS idx_event_parts_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_parts_char ON event_participants(character_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_character_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_character_id);
CREATE INDEX IF NOT EXISTS idx_secrets_universe ON secrets(universe_id);
CREATE INDEX IF NOT EXISTS idx_char_secrets_char ON character_secrets(character_id);
CREATE INDEX IF NOT EXISTS idx_char_secrets_sec ON character_secrets(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_events_event ON secret_events(event_id);
CREATE INDEX IF NOT EXISTS idx_findings_universe ON continuity_findings(universe_id);
CREATE INDEX IF NOT EXISTS idx_findings_status ON continuity_findings(universe_id, status);
