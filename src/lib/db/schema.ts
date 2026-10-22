/**
 * WORLDBUILD Database Schema Blueprint (PostgreSQL)
 * Prepared for the upcoming database-backed application phase.
 * 
 * Supports hierarchical universes, multifaceted lore entities, polymorphic relationship
 * graph edges, temporal causality checkpoints, and the Continuity Oracle contradiction table.
 */

export interface UniverseRecord {
  id: string; // uuid
  slug: string;
  title: string;
  tagline: string | null;
  lore_manifesto: string | null;
  owner_id: string;
  is_public: boolean;
  causal_integrity_score: number; // 0.00 - 100.00
  created_at: Date;
  updated_at: Date;
}

export interface EntityRecord {
  id: string; // uuid
  universe_id: string;
  entity_type: 'character' | 'location' | 'event' | 'artifact' | 'faction' | 'magic_system';
  name: string;
  epithet: string | null;
  summary: string;
  content_markdown: string;
  lore_status: 'canonical' | 'apocryphal' | 'disputed' | 'draft';
  origin_epoch_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface EntityRelationshipRecord {
  id: string; // uuid
  universe_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string; // e.g. "apprenticed_to", "ruler_of", "destroyed_by", "wields"
  causality_strength: number; // 1 to 10
  is_bidirectional: boolean;
  notes: string | null;
  created_at: Date;
}

export interface TimelineEpochRecord {
  id: string;
  universe_id: string;
  name: string;
  order_index: number;
  start_year: number;
  end_year: number | null;
  temporal_plane: string;
  summary: string;
}

export interface ContinuityParadoxRecord {
  id: string;
  universe_id: string;
  paradox_code: string;
  severity: 'critical' | 'warning' | 'advisory';
  category: string;
  title: string;
  description: string;
  primary_entity_id: string;
  conflicting_entity_id: string;
  is_resolved: boolean;
  resolution_type: string | null;
  resolved_at: Date | null;
  detected_at: Date;
}

/**
 * SQL DDL Schema generator script for PostgreSQL migration
 */
export const POSTGRES_DDL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE entity_type_enum AS ENUM ('character', 'location', 'event', 'artifact', 'faction', 'magic_system');
CREATE TYPE lore_status_enum AS ENUM ('canonical', 'apocryphal', 'disputed', 'draft');
CREATE TYPE paradox_severity_enum AS ENUM ('critical', 'warning', 'advisory');

CREATE TABLE universes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(120) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  tagline TEXT,
  lore_manifesto TEXT,
  owner_id VARCHAR(255) NOT NULL,
  is_public BOOLEAN DEFAULT false,
  causal_integrity_score NUMERIC(5,2) DEFAULT 100.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE entities (
  id UUID PRIMARYARY KEY DEFAULT uuid_generate_v4(),
  universe_id UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  entity_type entity_type_enum NOT NULL,
  name VARCHAR(255) NOT NULL,
  epithet VARCHAR(255),
  summary TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  lore_status lore_status_enum DEFAULT 'canonical',
  origin_epoch_id UUID,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  universe_id UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type VARCHAR(100) NOT NULL,
  causality_strength SMALLINT DEFAULT 5,
  is_bidirectional BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE continuity_paradoxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  universe_id UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  paradox_code VARCHAR(50) NOT NULL,
  severity paradox_severity_enum DEFAULT 'warning',
  category VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  primary_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  conflicting_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  is_resolved BOOLEAN DEFAULT false,
  resolution_type VARCHAR(100),
  resolved_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_universe ON entities(universe_id);
CREATE INDEX idx_relationships_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_relationships_target ON entity_relationships(target_entity_id);
CREATE INDEX idx_paradoxes_universe ON continuity_paradoxes(universe_id);
`;
