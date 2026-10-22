import crypto from 'crypto';
import { RuleCode } from './types';

/**
 * Generates a deterministic MD5 fingerprint for a continuity finding.
 * Uses the stable ruleCode and lexicographically sorted affected entity IDs
 * to ensure that identical causal paradoxes always yield the same fingerprint.
 */
export function generateFindingFingerprint(
  ruleCode: RuleCode | string,
  entityIds: string[]
): string {
  const uniqueSortedIds = Array.from(new Set(entityIds.filter(Boolean))).sort();
  const rawKey = `${ruleCode}:${uniqueSortedIds.join(':')}`;
  return crypto.createHash('md5').update(rawKey).digest('hex');
}
