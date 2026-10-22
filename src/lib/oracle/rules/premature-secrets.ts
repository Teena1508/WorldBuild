import { DbClient } from '@/lib/db';
import { FindingSeverity, RawFindingCandidate, RULE_CODES } from '../types';

interface SecretUsageRow {
  secret_event_id: string;
  usage_type: string;
  event_id: string;
  event_title: string;
  event_year: number;
  event_seq: number;
  secret_id: string;
  secret_title: string;
  secret_severity: string;
  character_id: string;
  character_name: string;
  knowledge_id: string | null;
  learned_year: number | null;
  learned_at_event_id: string | null;
  learn_event_title: string | null;
  learn_event_year: number | null;
  learn_event_seq: number | null;
}

export async function scanPrematureSecrets(
  db: DbClient,
  universeId: string
): Promise<RawFindingCandidate[]> {
  const sql = `
    SELECT 
      se.id as secret_event_id,
      se.usage_type,
      e.id as event_id,
      e.title as event_title,
      e.timestamp_year as event_year,
      e.sequence_number as event_seq,
      s.id as secret_id,
      s.title as secret_title,
      s.severity as secret_severity,
      c.id as character_id,
      c.name as character_name,
      cs.id as knowledge_id,
      cs.learned_year,
      cs.learned_at_event_id,
      e_learn.title as learn_event_title,
      e_learn.timestamp_year as learn_event_year,
      e_learn.sequence_number as learn_event_seq
    FROM secret_events se
    JOIN events e ON se.event_id = e.id
    JOIN secrets s ON se.secret_id = s.id
    JOIN characters c ON se.character_id = c.id
    LEFT JOIN character_secrets cs ON cs.character_id = c.id AND cs.secret_id = s.id
    LEFT JOIN events e_learn ON cs.learned_at_event_id = e_learn.id
    WHERE e.universe_id = $1
    ORDER BY e.timestamp_year ASC, e.sequence_number ASC
  `;

  const res = await db.query<SecretUsageRow>(sql, [universeId]);
  const candidates: RawFindingCandidate[] = [];

  for (const row of res.rows) {
    // Case 1: Missing knowledge record entirely
    if (!row.knowledge_id) {
      candidates.push({
        ruleCode: RULE_CODES.PREMATURE_SECRET,
        findingType: 'violation',
        severity: 'high',
        title: `Missing Secret Knowledge: ${row.character_name} deploys "${row.secret_title}"`,
        explanation: `${row.character_name} ${row.usage_type} secret "${row.secret_title}" in event "${row.event_title}" (Year ${row.event_year}), but has no recorded knowledge entry establishing how or when they learned this lore.`,
        suggestedResolution: `Create a Character Knowledge entry for ${row.character_name} learning "${row.secret_title}" on or before Year ${row.event_year}, or change the event actor.`,
        evidence: {
          violationSubtype: 'missing_knowledge_record',
          characterId: row.character_id,
          characterName: row.character_name,
          secretId: row.secret_id,
          secretTitle: row.secret_title,
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventYear: row.event_year,
          usageType: row.usage_type,
        },
        affectedEntities: [
          { id: row.character_id, type: 'character', name: row.character_name },
          { id: row.secret_id, type: 'secret', name: row.secret_title },
          { id: row.event_id, type: 'event', name: row.event_title },
        ],
        entityIdsForFingerprint: [row.character_id, row.secret_id, row.event_id],
      });
      continue;
    }

    // Case 2: Knowledge record exists, but learned year / event is after usage
    let isPremature = false;
    let violationSubtype = '';
    let severity: FindingSeverity = 'high';
    let explanation = '';

    if (row.learned_year !== null && row.learned_year > row.event_year) {
      isPremature = true;
      violationSubtype = 'chronological_premature_knowledge';
      severity = 'critical';
      explanation = `${row.character_name} ${row.usage_type} secret "${row.secret_title}" at Year ${row.event_year} in "${row.event_title}", but is recorded as only learning this secret at Year ${row.learned_year}. Epistemic causality requires knowledge acquisition to precede or coincide with revelation.`;
    } else if (row.learn_event_year !== null && row.learn_event_year > row.event_year) {
      isPremature = true;
      violationSubtype = 'chronological_premature_knowledge';
      severity = 'critical';
      explanation = `${row.character_name} ${row.usage_type} secret "${row.secret_title}" at Year ${row.event_year} in "${row.event_title}", but learns it during event "${row.learn_event_title}" at Year ${row.learn_event_year}.`;
    } else if (
      row.learn_event_year !== null &&
      row.learn_event_year === row.event_year &&
      row.learn_event_seq !== null &&
      row.learn_event_seq > row.event_seq &&
      (row.learn_event_seq > 0 || row.event_seq > 0)
    ) {
      isPremature = true;
      violationSubtype = 'narrative_premature_knowledge';
      severity = 'high';
      explanation = `${row.character_name} ${row.usage_type} secret "${row.secret_title}" in "${row.event_title}" (Sequence #${row.event_seq}), which precedes the discovery event "${row.learn_event_title}" (Sequence #${row.learn_event_seq}) in narrative sequence.`;
    }

    if (isPremature) {
      candidates.push({
        ruleCode: RULE_CODES.PREMATURE_SECRET,
        findingType: 'violation',
        severity,
        title: `Premature Secret Usage: ${row.character_name} in "${row.event_title}"`,
        explanation,
        suggestedResolution: `Update the secret learning year/event to precede Year ${row.event_year}, or postpone "${row.event_title}" until after the knowledge has been acquired.`,
        evidence: {
          violationSubtype,
          characterId: row.character_id,
          characterName: row.character_name,
          secretId: row.secret_id,
          secretTitle: row.secret_title,
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventYear: row.event_year,
          learnedYear: row.learned_year,
          learnEventTitle: row.learn_event_title,
          learnEventYear: row.learn_event_year,
        },
        affectedEntities: [
          { id: row.character_id, type: 'character', name: row.character_name },
          { id: row.secret_id, type: 'secret', name: row.secret_title },
          { id: row.event_id, type: 'event', name: row.event_title },
        ],
        entityIdsForFingerprint: [row.character_id, row.secret_id, row.event_id],
      });
    }
  }

  return candidates;
}
