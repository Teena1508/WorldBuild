import { DbClient } from '@/lib/db';
import { FindingSeverity, RawFindingCandidate, RULE_CODES } from '../types';

interface PredecessorViolationRow {
  dependency_id: string;
  dependency_type: string;
  dep_event_id: string;
  dep_event_title: string;
  dep_year: number;
  dep_seq: number;
  pred_event_id: string;
  pred_event_title: string;
  pred_year: number;
  pred_seq: number;
}

export async function scanPredecessorViolations(
  db: DbClient,
  universeId: string
): Promise<RawFindingCandidate[]> {
  const sql = `
    SELECT 
      ed.id as dependency_id,
      ed.dependency_type,
      e_dep.id as dep_event_id,
      e_dep.title as dep_event_title,
      e_dep.timestamp_year as dep_year,
      e_dep.sequence_number as dep_seq,
      e_pred.id as pred_event_id,
      e_pred.title as pred_event_title,
      e_pred.timestamp_year as pred_year,
      e_pred.sequence_number as pred_seq
    FROM event_dependencies ed
    JOIN events e_dep ON ed.event_id = e_dep.id
    JOIN events e_pred ON ed.predecessor_event_id = e_pred.id
    WHERE e_dep.universe_id = $1
      AND (
        e_dep.timestamp_year < e_pred.timestamp_year
        OR (
          e_dep.sequence_number < e_pred.sequence_number
          AND (e_dep.sequence_number > 0 OR e_pred.sequence_number > 0)
        )
      )
    ORDER BY e_dep.timestamp_year ASC, e_dep.sequence_number ASC
  `;

  const res = await db.query<PredecessorViolationRow>(sql, [universeId]);
  const candidates: RawFindingCandidate[] = [];

  for (const row of res.rows) {
    const isTemporalInversion = row.dep_year < row.pred_year;
    const isNarrativeInversion = row.dep_seq < row.pred_seq && (row.dep_seq > 0 || row.pred_seq > 0);

    let violationSubtype = 'temporal_inversion';
    let severity: FindingSeverity = 'critical';
    let detailMsg = '';

    if (isTemporalInversion && isNarrativeInversion) {
      violationSubtype = 'temporal_and_narrative_inversion';
      severity = 'critical';
      detailMsg = `Event "${row.dep_event_title}" (Year ${row.dep_year}, Sequence #${row.dep_seq}) occurs both earlier in timeline ticks and narrative sequence than its declared prerequisite "${row.pred_event_title}" (Year ${row.pred_year}, Sequence #${row.pred_seq}).`;
    } else if (isTemporalInversion) {
      violationSubtype = 'chronological_inversion';
      severity = 'critical';
      detailMsg = `Event "${row.dep_event_title}" (Year ${row.dep_year}) is chronologically dated before its required predecessor "${row.pred_event_title}" (Year ${row.pred_year}). An event cannot causally depend on an occurrence situated in its future.`;
    } else {
      violationSubtype = 'narrative_sequence_inversion';
      severity = 'high';
      detailMsg = `Event "${row.dep_event_title}" (Sequence #${row.dep_seq}) precedes its required predecessor "${row.pred_event_title}" (Sequence #${row.pred_seq}) in narrative ordering, creating a broken reader chronicle sequence.`;
    }

    candidates.push({
      ruleCode: RULE_CODES.PREDECESSOR_VIOLATION,
      findingType: 'violation',
      severity,
      title: `Predecessor Inversion: "${row.dep_event_title}" before "${row.pred_event_title}"`,
      explanation: detailMsg,
      suggestedResolution: `Adjust "${row.dep_event_title}" timestamp year to >= ${row.pred_year} (and sequence number >= ${row.pred_seq}), or re-sequence the predecessor event to precede this event.`,
      evidence: {
        dependencyId: row.dependency_id,
        dependencyType: row.dependency_type,
        violationSubtype,
        dependentEvent: {
          id: row.dep_event_id,
          title: row.dep_event_title,
          timestampYear: row.dep_year,
          sequenceNumber: row.dep_seq,
        },
        predecessorEvent: {
          id: row.pred_event_id,
          title: row.pred_event_title,
          timestampYear: row.pred_year,
          sequenceNumber: row.pred_seq,
        },
      },
      affectedEntities: [
        { id: row.dep_event_id, type: 'event', name: row.dep_event_title },
        { id: row.pred_event_id, type: 'event', name: row.pred_event_title },
      ],
      entityIdsForFingerprint: [row.dep_event_id, row.pred_event_id],
    });
  }

  return candidates;
}
