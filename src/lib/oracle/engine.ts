import crypto from 'crypto';
import { DbClient, query, transaction } from '@/lib/db';
import { ContinuityFinding } from '@/lib/db/types';
import { generateFindingFingerprint } from './fingerprint';
import { scanSpatialOverlap } from './rules/spatial-overlap';
import { scanCyclicDependencies } from './rules/cyclic-dependencies';
import { scanPredecessorViolations } from './rules/predecessor-violations';
import { scanPrematureSecrets } from './rules/premature-secrets';
import { scanPostMortemActivity } from './rules/post-mortem-activity';
import { OracleScanSummary, RawFindingCandidate } from './types';

export async function runContinuityScan(
  universeId: string,
  providedTx?: DbClient
): Promise<{ summary: OracleScanSummary; findings: ContinuityFinding[] }> {
  const runner = async (db: DbClient) => {
    // 1. Execute all 5 diagnostic rules
    const [spatial, cyclic, predecessor, secrets, postMortem] = await Promise.all([
      scanSpatialOverlap(db, universeId),
      scanCyclicDependencies(db, universeId),
      scanPredecessorViolations(db, universeId),
      scanPrematureSecrets(db, universeId),
      scanPostMortemActivity(db, universeId),
    ]);

    const allCandidates: RawFindingCandidate[] = [
      ...spatial,
      ...cyclic,
      ...predecessor,
      ...secrets,
      ...postMortem,
    ];

    // 2. Compute deterministic fingerprints and map candidates
    const detectedMap = new Map<string, RawFindingCandidate>();
    for (const c of allCandidates) {
      const fp = generateFindingFingerprint(c.ruleCode, c.entityIdsForFingerprint);
      detectedMap.set(fp, c);
    }

    // 3. Query existing findings for universe
    const existingRes = await db.query<ContinuityFinding>(
      `SELECT * FROM continuity_findings WHERE universe_id = $1 ORDER BY created_at ASC`,
      [universeId]
    );
    const existingMap = new Map<string, ContinuityFinding>();
    for (const f of existingRes.rows) {
      existingMap.set(f.fingerprint, f);
    }

    let newFindingsCount = 0;
    let autoResolvedCount = 0;

    // 4. Upsert / Handle Detected Findings
    for (const [fp, candidate] of detectedMap.entries()) {
      const existing = existingMap.get(fp);

      if (!existing) {
        // Insert new open finding
        const findingId = `find-${crypto.randomUUID().slice(0, 12)}`;
        await db.query(
          `INSERT INTO continuity_findings (
            id, universe_id, rule_code, finding_type, severity, title,
            explanation, evidence_json, affected_entities_json, status,
            fingerprint, suggested_resolution, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, NOW(), NOW())`,
          [
            findingId,
            universeId,
            candidate.ruleCode,
            candidate.findingType,
            candidate.severity,
            candidate.title,
            candidate.explanation,
            JSON.stringify(candidate.evidence),
            JSON.stringify(candidate.affectedEntities),
            fp,
            candidate.suggestedResolution,
          ]
        );
        newFindingsCount++;
      } else {
        // If previously resolved, reopen because it reproduces again
        if (existing.status === 'resolved') {
          await db.query(
            `UPDATE continuity_findings 
             SET status = 'open',
                 explanation = $1,
                 evidence_json = $2,
                 affected_entities_json = $3,
                 suggested_resolution = $4,
                 resolved_at = NULL,
                 updated_at = NOW()
             WHERE id = $5`,
            [
              candidate.explanation,
              JSON.stringify(candidate.evidence),
              JSON.stringify(candidate.affectedEntities),
              candidate.suggestedResolution,
              existing.id,
            ]
          );
        } else if (existing.status === 'open') {
          // Refresh details and update timestamp
          await db.query(
            `UPDATE continuity_findings
             SET explanation = $1,
                 evidence_json = $2,
                 affected_entities_json = $3,
                 suggested_resolution = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [
              candidate.explanation,
              JSON.stringify(candidate.evidence),
              JSON.stringify(candidate.affectedEntities),
              candidate.suggestedResolution,
              existing.id,
            ]
          );
        }
        // If existing.status === 'ignored', preserve intentional exception state
      }
    }

    // 5. Handle findings that are no longer detected (Mark Resolved)
    for (const [fp, existing] of existingMap.entries()) {
      if (!detectedMap.has(fp)) {
        if (existing.status === 'open') {
          await db.query(
            `UPDATE continuity_findings
             SET status = 'resolved',
                 resolved_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [existing.id]
          );
          autoResolvedCount++;
        } else if (existing.status === 'ignored') {
          // If the condition vanished, mark resolved as well
          await db.query(
            `UPDATE continuity_findings
             SET status = 'resolved',
                 resolved_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [existing.id]
          );
        }
      }
    }

    // 6. Fetch final refreshed findings
    const finalFindingsRes = await db.query<ContinuityFinding>(
      `SELECT * FROM continuity_findings 
       WHERE universe_id = $1 
       ORDER BY 
         CASE status 
           WHEN 'open' THEN 1 
           WHEN 'ignored' THEN 2 
           WHEN 'resolved' THEN 3 
         END,
         CASE severity 
           WHEN 'critical' THEN 1 
           WHEN 'high' THEN 2 
           WHEN 'medium' THEN 3 
           WHEN 'low' THEN 4 
         END,
         created_at DESC`,
      [universeId]
    );

    const findings = finalFindingsRes.rows;
    const openCount = findings.filter((f) => f.status === 'open').length;
    const resolvedCount = findings.filter((f) => f.status === 'resolved').length;
    const ignoredCount = findings.filter((f) => f.status === 'ignored').length;

    // Calculate causal integrity score
    const criticalOpen = findings.filter((f) => f.status === 'open' && f.severity === 'critical').length;
    const highOpen = findings.filter((f) => f.status === 'open' && f.severity === 'high').length;
    const mediumOpen = findings.filter((f) => f.status === 'open' && f.severity === 'medium').length;

    let score = 100.0 - (criticalOpen * 15.0 + highOpen * 8.0 + mediumOpen * 3.0);
    if (score < 0) score = 0.0;
    score = Math.round(score * 10) / 10;

    const summary: OracleScanSummary = {
      universeId,
      scannedAt: new Date().toISOString(),
      totalFindings: findings.length,
      openCount,
      resolvedCount,
      ignoredCount,
      newFindingsCount,
      autoResolvedCount,
      causalIntegrityScore: score,
    };

    return { summary, findings };
  };

  if (providedTx) {
    return runner(providedTx);
  } else {
    return transaction(runner);
  }
}

/**
 * Marks a finding as ignored (intentional narrative exception) with an archival reason.
 */
export async function ignoreFinding(
  universeId: string,
  findingId: string,
  reason: string
): Promise<ContinuityFinding> {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length < 3) {
    throw new Error('A valid reason (at least 3 characters) is required to acknowledge an intentional exception.');
  }

  const res = await query<ContinuityFinding>(
    `UPDATE continuity_findings
     SET status = 'ignored',
         ignored_reason = $1,
         updated_at = NOW()
     WHERE id = $2 AND universe_id = $3
     RETURNING *`,
    [trimmed, findingId, universeId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Finding '${findingId}' not found in universe '${universeId}'`);
  }

  return res.rows[0];
}

/**
 * Manually marks a finding as resolved.
 */
export async function resolveFinding(
  universeId: string,
  findingId: string
): Promise<ContinuityFinding> {
  const res = await query<ContinuityFinding>(
    `UPDATE continuity_findings
     SET status = 'resolved',
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND universe_id = $2
     RETURNING *`,
    [findingId, universeId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Finding '${findingId}' not found in universe '${universeId}'`);
  }

  return res.rows[0];
}

/**
 * Reopens a finding back to 'open'.
 */
export async function reopenFinding(
  universeId: string,
  findingId: string
): Promise<ContinuityFinding> {
  const res = await query<ContinuityFinding>(
    `UPDATE continuity_findings
     SET status = 'open',
         ignored_reason = NULL,
         resolved_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND universe_id = $2
     RETURNING *`,
    [findingId, universeId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Finding '${findingId}' not found in universe '${universeId}'`);
  }

  return res.rows[0];
}

/**
 * Retrieves findings for a universe with optional status filtering.
 */
export async function getFindings(
  universeId: string,
  statusFilter?: 'open' | 'resolved' | 'ignored' | 'all'
): Promise<ContinuityFinding[]> {
  let sql = `
    SELECT * FROM continuity_findings
    WHERE universe_id = $1
  `;
  const params: unknown[] = [universeId];

  if (statusFilter && statusFilter !== 'all') {
    params.push(statusFilter);
    sql += ` AND status = $${params.length}`;
  }

  sql += `
    ORDER BY 
      CASE status 
        WHEN 'open' THEN 1 
        WHEN 'ignored' THEN 2 
        WHEN 'resolved' THEN 3 
      END,
      CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      created_at DESC
  `;

  const res = await query<ContinuityFinding>(sql, params);
  return res.rows;
}
