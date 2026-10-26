export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  session_token: string;
  password_hash?: string | null;
  created_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  expires_at: string;
  created_at: string;
  last_used_at: string;
}

export interface Universe {
  id: string;
  user_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  is_example: boolean;
  created_at: string;
  updated_at: string;
  // Aggregated stats when retrieved
  stats?: {
    charactersCount: number;
    locationsCount: number;
    chaptersCount: number;
    eventsCount: number;
    relationshipsCount: number;
    secretsCount: number;
    openFindingsCount: number;
  };
}

export interface Series {
  id: string;
  user_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  stories_count?: number;
}

export interface Story {
  id: string;
  user_id: string;
  series_id: string | null;
  series_order: number | null;
  title: string;
  slug?: string | null;
  description: string;
  cover_url: string | null;
  genres?: string;
  tags?: string;
  status: 'draft' | 'published' | 'archived';
  author_notes: string;
  is_example: boolean;
  created_at: string;
  updated_at: string;
  series_title?: string | null;
  linked_universes?: {
    id: string;
    title: string;
  }[];
  chapters_count?: number;
  total_words?: number;
}

export interface StoryUniverse {
  story_id: string;
  universe_id: string;
  created_at: string;
}

export interface Location {
  id: string;
  universe_id: string;
  name: string;
  realm: string;
  description: string;
  coordinates_x: number | null;
  coordinates_y: number | null;
  aliases?: string;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  universe_id: string | null;
  story_id?: string | null;
  title: string;
  sequence_number: number;
  summary: string;
  content: string;
  word_count: number;
  version: number;
  status: 'draft' | 'in_review' | 'canonized';
  author_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  universe_id: string;
  name: string;
  epithet: string | null;
  bio: string;
  birth_year: number | null;
  death_year: number | null;
  death_confirmed: boolean;
  death_exception_notes: string | null;
  status: 'alive' | 'deceased' | 'ascended' | 'displaced' | 'unknown';
  aliases?: string;
  created_at: string;
  updated_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  character_id: string;
  role: string | null;
  notes: string | null;
  character_name?: string;
}

export interface EventDependency {
  id: string;
  event_id: string;
  predecessor_event_id: string;
  dependency_type: 'requires_predecessor' | 'causal' | 'chronological';
  predecessor_title?: string;
  predecessor_year?: number;
}

export interface SecretEventUsage {
  id: string;
  event_id: string;
  secret_id: string;
  character_id: string | null;
  usage_type: 'used' | 'revealed' | 'referenced';
  secret_title?: string;
  character_name?: string;
}

export interface UniverseEvent {
  id: string;
  universe_id: string;
  title: string;
  description: string | null;
  sequence_number: number;
  timestamp_year: number;
  location_id: string | null;
  chapter_id: string | null;
  is_death_event: boolean;
  created_at: string;
  updated_at: string;
  location_name?: string | null;
  chapter_title?: string | null;
  participants_count?: number;
  dependencies_count?: number;
  participants?: EventParticipant[];
  dependencies?: EventDependency[];
  secret_usages?: SecretEventUsage[];
}

export interface Relationship {
  id: string;
  universe_id: string;
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  intensity: number;
  notes: string | null;
  created_at: string;
  source_character_name?: string;
  target_character_name?: string;
}

export interface Secret {
  id: string;
  universe_id: string;
  title: string;
  content: string;
  severity: 'minor' | 'major' | 'cosmic' | 'forbidden';
  created_at: string;
  updated_at: string;
  known_by?: {
    character_id: string;
    character_name: string;
    learned_year: number | null;
    learned_at_event_id: string | null;
  }[];
}

export interface CharacterSecret {
  id: string;
  character_id: string;
  secret_id: string;
  learned_at_event_id: string | null;
  learned_year: number | null;
  notes: string | null;
  secret_title?: string;
  character_name?: string;
}

export interface ContinuityFinding {
  id: string;
  universe_id: string;
  rule_code: string;
  finding_type: 'violation' | 'warning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  evidence_json: string; // Serialized JSON
  affected_entities_json: string; // Serialized JSON
  status: 'open' | 'resolved' | 'ignored';
  fingerprint: string;
  ignored_reason?: string | null;
  suggested_resolution?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type FindingCategory =
  | 'timeline_paradox'
  | 'character_knowledge'
  | 'spatial_impossibility'
  | 'causal_inconsistency'
  | 'unresolved_setup'
  | 'object_continuity'
  | 'unexplained_transfer'
  | 'canon_contradiction';

export type ChapterFindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ChapterFindingStatus = 'open' | 'accepted' | 'dismissed' | 'resolved';
export type ChapterFindingSource = 'deterministic_rule' | 'local_ai';

export interface ChapterAnalysisFinding {
  id: string;
  chapter_id: string;
  universe_id?: string | null;
  story_id?: string | null;
  chapter_version: number;
  category: FindingCategory;
  severity: ChapterFindingSeverity;
  title: string;
  description: string;
  passage: string | null;
  passage_reference: string | null;
  conflicting_canon: string | null;
  explanation: string;
  suggested_fix: string | null;
  confidence: number;
  status: ChapterFindingStatus;
  dismissal_reason: string | null;
  author_notes: string | null;
  source: ChapterFindingSource;
  fingerprint: string;
  is_stale: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManuscriptImport {
  id: string;
  user_id: string;
  story_id: string | null;
  filename: string;
  file_type: 'text' | 'markdown' | 'docx';
  file_size: number;
  content_hash: string;
  chapter_count: number;
  total_words: number;
  status: 'previewed' | 'imported' | 'failed';
  metadata_json: string;
  created_at: string;
}

export interface PublishedStory {
  id: string;
  story_id: string;
  author_id: string;
  slug: string;
  public_title: string;
  public_description: string;
  cover_url: string | null;
  genres: string;
  tags: string;
  status: 'published' | 'unpublished';
  publication_version: number;
  published_at: string;
  updated_at: string;
  author_pen_name?: string;
  chapters_count?: number;
  total_words?: number;
}

export interface PublishedChapterSnapshot {
  id: string;
  published_story_id: string;
  chapter_id: string;
  sequence_number: number;
  title: string;
  content: string;
  word_count: number;
  version_number: number;
  is_current: boolean;
  published_at: string;
}

export interface AuthorProfile {
  user_id: string;
  pen_name: string;
  bio: string;
  avatar_url: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export type EntityType = 'character' | 'location' | 'event' | 'lore_object' | 'unknown';
export type EntityRelationshipType = 'appears' | 'mentioned' | 'setting' | 'participates' | 'referenced';
export type EntityLinkStatus = 'confirmed' | 'detected' | 'needs_review' | 'dismissed';
export type EntityLinkSource = 'deterministic' | 'local_ai' | 'author_confirmed' | 'manual';

export interface EntityMentionPosition {
  start: number;
  end: number;
  text: string;
}

export interface ChapterEntityLink {
  id: string;
  chapter_id: string;
  universe_id: string;
  story_id?: string | null;
  character_id?: string | null;
  location_id?: string | null;
  event_id?: string | null;
  entity_type: EntityType;
  entity_id: string | null;
  entity_name: string;
  matched_alias?: string | null;
  relationship_type: EntityRelationshipType;
  status: EntityLinkStatus;
  source: EntityLinkSource;
  confidence: number;
  mention_count: number;
  passage: string | null;
  passage_reference: string | null;
  positions_json: string; // Serialized EntityMentionPosition[]
  positions?: EntityMentionPosition[];
  author_notes?: string | null;
  is_stale: boolean;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  chapter_title?: string;
  chapter_sequence?: number;
}

