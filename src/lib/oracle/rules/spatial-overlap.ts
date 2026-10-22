import { DbClient } from '@/lib/db';
import { RawFindingCandidate, RULE_CODES } from '../types';

interface SpatialOverlapRow {
  character_id: string;
  character_name: string;
  char_exception: string | null;
  event1_id: string;
  event1_title: string;
  year: number;
  location1_id: string;
  location1_name: string;
  ep1_role: string | null;
  ep1_notes: string | null;
  event2_id: string;
  event2_title: string;
  location2_id: string;
  location2_name: string;
  ep2_role: string | null;
  ep2_notes: string | null;
}

const SPATIAL_EXCEPTION_REGEX = /bilocation|omnipresen|astral|clone|teleport|simultaneous|avatar|projection|mirage|spectral|split/i;

export async function scanSpatialOverlap(
  db: DbClient,
  universeId: string
): Promise<RawFindingCandidate[]> {
  const sql = `
    SELECT 
      c.id as character_id,
      c.name as character_name,
      c.death_exception_notes as char_exception,
      e1.id as event1_id,
      e1.title as event1_title,
      e1.timestamp_year as year,
      l1.id as location1_id,
      l1.name as location1_name,
      ep1.role as ep1_role,
      ep1.notes as ep1_notes,
      e2.id as event2_id,
      e2.title as event2_title,
      l2.id as location2_id,
      l2.name as location2_name,
      ep2.role as ep2_role,
      ep2.notes as ep2_notes
    FROM event_participants ep1
    JOIN events e1 ON ep1.event_id = e1.id
    JOIN locations l1 ON e1.location_id = l1.id
    JOIN event_participants ep2 ON ep1.character_id = ep2.character_id AND ep1.event_id < ep2.event_id
    JOIN events e2 ON ep2.event_id = e2.id
    JOIN locations l2 ON e2.location_id = l2.id
    JOIN characters c ON ep1.character_id = c.id
    WHERE e1.universe_id = $1
      AND e2.universe_id = $1
      AND e1.timestamp_year = e2.timestamp_year
      AND e1.location_id <> e2.location_id
    ORDER BY e1.timestamp_year ASC, c.id ASC
  `;

  const res = await db.query<SpatialOverlapRow>(sql, [universeId]);
  const candidates: RawFindingCandidate[] = [];

  for (const row of res.rows) {
    // Check for explicit spatial exceptions
    const combinedNotes = [
      row.char_exception,
      row.ep1_role,
      row.ep1_notes,
      row.ep2_role,
      row.ep2_notes,
    ]
      .filter(Boolean)
      .join(' ');

    if (SPATIAL_EXCEPTION_REGEX.test(combinedNotes)) {
      continue;
    }

    candidates.push({
      ruleCode: RULE_CODES.SPATIAL_OVERLAP,
      findingType: 'violation',
      severity: 'high',
      title: `Spatial Bilocation Paradox: ${row.character_name} at Year ${row.year}`,
      explanation: `${row.character_name} is simultaneously present at two distinct geographic locations during Year ${row.year}: "${row.location1_name}" (in "${row.event1_title}") and "${row.location2_name}" (in "${row.event2_title}"). Without an explicit bilocation or astral projection narrative exception, a character cannot inhabit two places at the same timeline tick.`,
      suggestedResolution: `Reassign one event's year, consolidate both events into a shared location, or annotate the character/event participation with an intentional supernatural or bilocation exception.`,
      evidence: {
        characterId: row.character_id,
        characterName: row.character_name,
        timestampYear: row.year,
        event1: {
          id: row.event1_id,
          title: row.event1_title,
          locationId: row.location1_id,
          locationName: row.location1_name,
        },
        event2: {
          id: row.event2_id,
          title: row.event2_title,
          locationId: row.location2_id,
          locationName: row.location2_name,
        },
      },
      affectedEntities: [
        { id: row.character_id, type: 'character', name: row.character_name },
        { id: row.event1_id, type: 'event', name: row.event1_title },
        { id: row.event2_id, type: 'event', name: row.event2_title },
        { id: row.location1_id, type: 'location', name: row.location1_name },
        { id: row.location2_id, type: 'location', name: row.location2_name },
      ],
      entityIdsForFingerprint: [row.character_id, row.event1_id, row.event2_id],
    });
  }

  return candidates;
}
