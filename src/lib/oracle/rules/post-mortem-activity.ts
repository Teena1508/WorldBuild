import { DbClient } from '@/lib/db';
import { RawFindingCandidate, RULE_CODES } from '../types';

interface PostMortemRow {
  character_id: string;
  character_name: string;
  death_year: number | null;
  death_confirmed: boolean;
  death_exception_notes: string | null;
  character_status: string;
  event_id: string;
  event_title: string;
  event_year: number;
  event_seq: number;
  is_death_event: boolean;
  participant_role: string | null;
  participant_notes: string | null;
  death_event_id: string | null;
  death_event_title: string | null;
  death_event_year: number | null;
}

const POST_MORTEM_EXCEPTION_REGEX =
  /flashback|vision|memory|ghost|spirit|wraith|undead|resurrect|illusion|spectral|hologram|dream|reincarnat|avatar|echo|afterlife|projection/i;

export async function scanPostMortemActivity(
  db: DbClient,
  universeId: string
): Promise<RawFindingCandidate[]> {
  const sql = `
    SELECT 
      c.id as character_id,
      c.name as character_name,
      c.death_year,
      c.death_confirmed,
      c.death_exception_notes,
      c.status as character_status,
      e.id as event_id,
      e.title as event_title,
      e.timestamp_year as event_year,
      e.sequence_number as event_seq,
      e.is_death_event,
      ep.role as participant_role,
      ep.notes as participant_notes,
      e_death.id as death_event_id,
      e_death.title as death_event_title,
      e_death.timestamp_year as death_event_year
    FROM event_participants ep
    JOIN events e ON ep.event_id = e.id
    JOIN characters c ON ep.character_id = c.id
    LEFT JOIN LATERAL (
      SELECT ed.id, ed.title, ed.timestamp_year
      FROM event_participants epd
      JOIN events ed ON epd.event_id = ed.id
      WHERE epd.character_id = c.id
        AND ed.universe_id = e.universe_id
        AND ed.is_death_event = true
      ORDER BY ed.timestamp_year ASC
      LIMIT 1
    ) e_death ON true
    WHERE e.universe_id = $1
      AND (
        (c.death_year IS NOT NULL AND e.timestamp_year > c.death_year)
        OR (e_death.timestamp_year IS NOT NULL AND e.timestamp_year > e_death.timestamp_year)
      )
    ORDER BY e.timestamp_year ASC
  `;

  const res = await db.query<PostMortemRow>(sql, [universeId]);
  const candidates: RawFindingCandidate[] = [];

  for (const row of res.rows) {
    // 1. Explicit character statuses that transcend mortal death
    if (row.character_status === 'ascended' || row.character_status === 'displaced') {
      continue;
    }

    // 2. Explicit character death exception notes (e.g. resurrection, lichdom)
    if (row.death_exception_notes && row.death_exception_notes.trim().length > 0) {
      continue;
    }

    // 3. Participation-level narrative annotation (e.g. role='Vision', notes='Appears in memory')
    const combinedParticipantText = [row.participant_role, row.participant_notes]
      .filter(Boolean)
      .join(' ');
    if (POST_MORTEM_EXCEPTION_REGEX.test(combinedParticipantText)) {
      continue;
    }

    const baselineDeathYear = row.death_year ?? row.death_event_year ?? 0;
    const deathContext = row.death_event_title
      ? `death event "${row.death_event_title}" (Year ${baselineDeathYear})`
      : `recorded death in Year ${baselineDeathYear}`;

    candidates.push({
      ruleCode: RULE_CODES.POST_MORTEM_ACTIVITY,
      findingType: 'violation',
      severity: 'critical',
      title: `Unannotated Post-Mortem Activity: ${row.character_name} in "${row.event_title}"`,
      explanation: `${row.character_name} participates in "${row.event_title}" at Year ${row.event_year}, which occurs after their ${deathContext}. No supernatural, spiritual, flashback, or resurrection narrative exception is documented on either the character record or event participation entry.`,
      suggestedResolution: `Document an intentional narrative exception on the character (e.g. in death_exception_notes), label the event participation role as a flashback/spirit/vision, or adjust event dates.`,
      evidence: {
        characterId: row.character_id,
        characterName: row.character_name,
        deathYear: row.death_year,
        deathConfirmed: row.death_confirmed,
        deathEventId: row.death_event_id,
        deathEventTitle: row.death_event_title,
        deathEventYear: row.death_event_year,
        eventId: row.event_id,
        eventTitle: row.event_title,
        eventYear: row.event_year,
        participantRole: row.participant_role,
        participantNotes: row.participant_notes,
      },
      affectedEntities: [
        { id: row.character_id, type: 'character', name: row.character_name },
        { id: row.event_id, type: 'event', name: row.event_title },
      ],
      entityIdsForFingerprint: [row.character_id, row.event_id],
    });
  }

  return candidates;
}
