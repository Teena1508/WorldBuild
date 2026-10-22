export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  session_token: string;
  created_at: string;
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

export interface Location {
  id: string;
  universe_id: string;
  name: string;
  realm: string;
  description: string;
  coordinates_x: number | null;
  coordinates_y: number | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  universe_id: string;
  title: string;
  sequence_number: number;
  summary: string;
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

