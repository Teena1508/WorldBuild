import { DbClient } from '@/lib/db';

/**
 * Cross-Universe Entity Integrity Validators
 * Ensures related entities in any mutation belong to the exact same universe,
 * preventing cross-universe contamination.
 */

export async function validateCharacterInUniverse(
  db: DbClient,
  characterId: string,
  universeId: string
): Promise<void> {
  const res = await db.query(
    'SELECT id FROM characters WHERE id = $1 AND universe_id = $2',
    [characterId, universeId]
  );
  if (res.rows.length === 0) {
    throw new Error(`Character '${characterId}' does not belong to this universe`);
  }
}

export async function validateLocationInUniverse(
  db: DbClient,
  locationId: string,
  universeId: string
): Promise<void> {
  const res = await db.query(
    'SELECT id FROM locations WHERE id = $1 AND universe_id = $2',
    [locationId, universeId]
  );
  if (res.rows.length === 0) {
    throw new Error(`Location '${locationId}' does not belong to this universe`);
  }
}

export async function validateChapterInUniverse(
  db: DbClient,
  chapterId: string,
  universeId: string
): Promise<void> {
  const res = await db.query(
    'SELECT id FROM chapters WHERE id = $1 AND universe_id = $2',
    [chapterId, universeId]
  );
  if (res.rows.length === 0) {
    throw new Error(`Chapter '${chapterId}' does not belong to this universe`);
  }
}

export async function validateEventInUniverse(
  db: DbClient,
  eventId: string,
  universeId: string
): Promise<void> {
  const res = await db.query(
    'SELECT id FROM events WHERE id = $1 AND universe_id = $2',
    [eventId, universeId]
  );
  if (res.rows.length === 0) {
    throw new Error(`Event '${eventId}' does not belong to this universe`);
  }
}

export async function validateSecretInUniverse(
  db: DbClient,
  secretId: string,
  universeId: string
): Promise<void> {
  const res = await db.query(
    'SELECT id FROM secrets WHERE id = $1 AND universe_id = $2',
    [secretId, universeId]
  );
  if (res.rows.length === 0) {
    throw new Error(`Secret '${secretId}' does not belong to this universe`);
  }
}

/**
 * Checks if adding an edge eventId -> predecessorId would create a dependency cycle.
 * Traversing upstream from predecessorId: if we can reach eventId, adding this edge causes a cycle!
 */
export async function wouldCreateDependencyCycle(
  db: DbClient,
  eventId: string,
  predecessorEventId: string
): Promise<boolean> {
  if (eventId === predecessorEventId) {
    return true;
  }

  // Traverse all ancestors of predecessorEventId
  const visited = new Set<string>();
  const queue: string[] = [predecessorEventId];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === eventId) {
      return true;
    }
    if (visited.has(curr)) continue;
    visited.add(curr);

    const ancestors = await db.query<{ predecessor_event_id: string }>(
      'SELECT predecessor_event_id FROM event_dependencies WHERE event_id = $1',
      [curr]
    );

    for (const row of ancestors.rows) {
      if (row.predecessor_event_id === eventId) {
        return true;
      }
      if (!visited.has(row.predecessor_event_id)) {
        queue.push(row.predecessor_event_id);
      }
    }
  }

  return false;
}
