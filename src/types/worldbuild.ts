export type EntityType = "character" | "location" | "event" | "artifact" | "faction" | "magic_system";

export type LoreStatus = "canonical" | "apocryphal" | "disputed" | "draft";

export interface UniverseEntity {
  id: string;
  name: string;
  type: EntityType;
  title: string;
  epoch: string;
  realm: string;
  summary: string;
  description: string;
  status: LoreStatus;
  secretsCount: number;
  connections: {
    targetId: string;
    targetName: string;
    relationship: string;
    type: EntityType;
  }[];
  tags: string[];
  attributes: Record<string, string>;
}

export interface TimelineEpoch {
  id: string;
  name: string;
  era: string;
  dateRange: string;
  summary: string;
  eventsCount: number;
  majorConflict: string;
}

export type ParadoxSeverity = "critical" | "warning" | "advisory";

export interface ContinuityContradiction {
  id: string;
  code: string;
  title: string;
  severity: ParadoxSeverity;
  category: "temporal_overlap" | "spatial_impossibility" | "genealogical_clash" | "magic_rule_violation";
  affectedEntities: {
    id: string;
    name: string;
    type: EntityType;
  }[];
  explanation: string;
  detectedAtTimeline: string;
  suggestedResolutions: {
    id: string;
    label: string;
    consequence: string;
  }[];
}

export interface AtlasRegion {
  id: string;
  name: string;
  coordinates: { x: number; y: number };
  plane: "Celestial Firmament" | "Terrestrial Mortal Coil" | "Abyssal Nether";
  climate: string;
  controllingFaction: string;
  loreSnippet: string;
}

export interface UniverseOverview {
  id: string;
  title: string;
  tagline: string;
  creatorName: string;
  lastSynchronized: string;
  stats: {
    totalEntities: number;
    activeTimelines: number;
    mappedRegions: number;
    causalIntegrity: number; // percentage, e.g. 99.8
    unresolvedParadoxes: number;
  };
}
