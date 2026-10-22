/**
 * Continuity Oracle Rules Engine Types
 */

export const RULE_CODES = {
  SPATIAL_OVERLAP: 'RULE_SPATIAL_OVERLAP',
  CYCLIC_DEPENDENCY: 'RULE_CYCLIC_DEPENDENCY',
  PREDECESSOR_VIOLATION: 'RULE_PREDECESSOR_VIOLATION',
  PREMATURE_SECRET: 'RULE_PREMATURE_SECRET',
  POST_MORTEM_ACTIVITY: 'RULE_POST_MORTEM_ACTIVITY',
} as const;

export type RuleCode = typeof RULE_CODES[keyof typeof RULE_CODES];

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingType = 'violation' | 'warning';
export type FindingStatus = 'open' | 'resolved' | 'ignored';

export interface AffectedEntityReference {
  id: string;
  type: 'character' | 'event' | 'location' | 'secret' | 'chapter';
  name: string;
}

export interface RawFindingCandidate {
  ruleCode: RuleCode;
  findingType: FindingType;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  suggestedResolution: string;
  evidence: Record<string, unknown>;
  affectedEntities: AffectedEntityReference[];
  entityIdsForFingerprint: string[];
}

export interface OracleScanSummary {
  universeId: string;
  scannedAt: string;
  totalFindings: number;
  openCount: number;
  resolvedCount: number;
  ignoredCount: number;
  newFindingsCount: number;
  autoResolvedCount: number;
  causalIntegrityScore: number; // 0.0 - 100.0%
}
