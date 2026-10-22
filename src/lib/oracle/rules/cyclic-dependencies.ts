import { DbClient } from '@/lib/db';
import { RawFindingCandidate, RULE_CODES } from '../types';

interface CycleRow {
  origin_id: string;
  path: string[];
}

export async function scanCyclicDependencies(
  db: DbClient,
  universeId: string
): Promise<RawFindingCandidate[]> {
  // Use PostgreSQL Recursive CTE for cycle detection in event dependencies
  const sql = `
    WITH RECURSIVE dep_chain AS (
      SELECT 
        ed.event_id AS origin_id,
        ed.predecessor_event_id AS current_id,
        ARRAY[ed.event_id, ed.predecessor_event_id] AS path,
        (ed.event_id = ed.predecessor_event_id) AS is_cycle,
        1 AS depth
      FROM event_dependencies ed
      JOIN events e ON ed.event_id = e.id
      WHERE e.universe_id = $1

      UNION ALL

      SELECT 
        dc.origin_id,
        next_ed.predecessor_event_id AS current_id,
        dc.path || next_ed.predecessor_event_id,
        (next_ed.predecessor_event_id = dc.origin_id) AS is_cycle,
        dc.depth + 1
      FROM dep_chain dc
      JOIN event_dependencies next_ed ON dc.current_id = next_ed.event_id
      WHERE NOT dc.is_cycle
        AND NOT (next_ed.predecessor_event_id = ANY(dc.path[2:]))
        AND dc.depth < 25
    )
    SELECT origin_id, path
    FROM dep_chain
    WHERE is_cycle = true
  `;

  const res = await db.query<CycleRow>(sql, [universeId]);
  if (res.rows.length === 0) {
    return [];
  }

  // Deduplicate cycles: multiple rotations of the same cycle [A, B, C, A] vs [B, C, A, B]
  const seenCycleSignatures = new Set<string>();
  const uniqueCycles: { cycleMemberIds: string[]; path: string[] }[] = [];

  for (const row of res.rows) {
    // path contains [A, B, C, A] -> slice off last duplicate origin to get members
    const memberIds = row.path.slice(0, -1);
    const sortedMembers = [...memberIds].sort();
    const signature = sortedMembers.join('::');

    if (!seenCycleSignatures.has(signature)) {
      seenCycleSignatures.add(signature);
      uniqueCycles.push({
        cycleMemberIds: sortedMembers,
        path: row.path,
      });
    }
  }

  // Fetch all titles for the involved events
  const allInvolvedIds = Array.from(
    new Set(uniqueCycles.flatMap((c) => c.cycleMemberIds))
  );

  const titleMap = new Map<string, string>();
  if (allInvolvedIds.length > 0) {
    const titlesRes = await db.query<{ id: string; title: string }>(
      'SELECT id, title FROM events WHERE id = ANY($1)',
      [allInvolvedIds]
    );
    for (const r of titlesRes.rows) {
      titleMap.set(r.id, r.title);
    }
  }

  const candidates: RawFindingCandidate[] = [];

  for (const cycle of uniqueCycles) {
    const pathTitles = cycle.path.map((id) => titleMap.get(id) || id);
    const readablePath = pathTitles.join(' ➔ ');
    const memberTitles = cycle.cycleMemberIds
      .map((id) => `"${titleMap.get(id) || id}"`)
      .join(', ');

    candidates.push({
      ruleCode: RULE_CODES.CYCLIC_DEPENDENCY,
      findingType: 'violation',
      severity: 'critical',
      title: `Causal Loop Paradox: Event Dependency Cycle Detected`,
      explanation: `A closed causal dependency loop was detected along the event chain: ${readablePath}. An event cannot be its own causal ancestor, as this creates an ontological bootstrap paradox.`,
      suggestedResolution: `Break the loop by removing or revising at least one dependency edge among the cycle participants: ${memberTitles}.`,
      evidence: {
        cycleMemberIds: cycle.cycleMemberIds,
        cyclePath: cycle.path,
        readablePath,
      },
      affectedEntities: cycle.cycleMemberIds.map((id) => ({
        id,
        type: 'event',
        name: titleMap.get(id) || id,
      })),
      entityIdsForFingerprint: cycle.cycleMemberIds,
    });
  }

  return candidates;
}
