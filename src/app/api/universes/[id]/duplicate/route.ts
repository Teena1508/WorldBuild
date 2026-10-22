import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import {
  Universe,
  Character,
  Location,
  Chapter,
  UniverseEvent,
  EventParticipant,
  EventDependency,
  Relationship,
  Secret,
  CharacterSecret,
  SecretEventUsage,
  ContinuityFinding,
} from '@/lib/db/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceUniverseId } = await props.params;
    const user = await getCurrentUser(request);
    const sourceUniverse = await verifyUniverseAccess(sourceUniverseId, user.id, 'read');

    const newUniverseId = `univ-${crypto.randomUUID().slice(0, 12)}`;
    const newTitle = `${sourceUniverse.title} (Copy)`;

    await transaction(async (tx) => {
      // 1. Create duplicate universe
      await tx.query(
        `INSERT INTO universes (id, user_id, title, description, cover_url, is_example, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())`,
        [newUniverseId, user.id, newTitle, sourceUniverse.description, sourceUniverse.cover_url]
      );

      // Maps for ID translations
      const charMap: Record<string, string> = {};
      const locMap: Record<string, string> = {};
      const chapMap: Record<string, string> = {};
      const eventMap: Record<string, string> = {};
      const secretMap: Record<string, string> = {};

      // 2. Clone Characters
      const chars = await tx.query<Character>(
        'SELECT * FROM characters WHERE universe_id = $1',
        [sourceUniverseId]
      );
      for (const c of chars.rows) {
        const newCharId = `char-${crypto.randomUUID().slice(0, 12)}`;
        charMap[c.id] = newCharId;
        await tx.query(
          `INSERT INTO characters (id, universe_id, name, epithet, bio, birth_year, death_year, death_confirmed, death_exception_notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            newCharId,
            newUniverseId,
            c.name,
            c.epithet,
            c.bio,
            c.birth_year,
            c.death_year,
            c.death_confirmed,
            c.death_exception_notes,
            c.status,
          ]
        );
      }

      // 3. Clone Locations
      const locs = await tx.query<Location>(
        'SELECT * FROM locations WHERE universe_id = $1',
        [sourceUniverseId]
      );
      for (const l of locs.rows) {
        const newLocId = `loc-${crypto.randomUUID().slice(0, 12)}`;
        locMap[l.id] = newLocId;
        await tx.query(
          `INSERT INTO locations (id, universe_id, name, realm, description, coordinates_x, coordinates_y)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newLocId, newUniverseId, l.name, l.realm, l.description, l.coordinates_x, l.coordinates_y]
        );
      }

      // 4. Clone Chapters
      const chaps = await tx.query<Chapter>(
        'SELECT * FROM chapters WHERE universe_id = $1',
        [sourceUniverseId]
      );
      for (const ch of chaps.rows) {
        const newChapId = `chap-${crypto.randomUUID().slice(0, 12)}`;
        chapMap[ch.id] = newChapId;
        await tx.query(
          `INSERT INTO chapters (id, universe_id, title, sequence_number, summary)
           VALUES ($1, $2, $3, $4, $5)`,
          [newChapId, newUniverseId, ch.title, ch.sequence_number, ch.summary]
        );
      }

      // 5. Clone Events
      const events = await tx.query<UniverseEvent>(
        'SELECT * FROM events WHERE universe_id = $1 ORDER BY sequence_number ASC',
        [sourceUniverseId]
      );
      for (const ev of events.rows) {
        const newEvId = `evt-${crypto.randomUUID().slice(0, 12)}`;
        eventMap[ev.id] = newEvId;
        const newLocId = ev.location_id ? locMap[ev.location_id] || null : null;
        const newChapId = ev.chapter_id ? chapMap[ev.chapter_id] || null : null;

        await tx.query(
          `INSERT INTO events (id, universe_id, title, description, sequence_number, timestamp_year, location_id, chapter_id, is_death_event)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newEvId, newUniverseId, ev.title, ev.description, ev.sequence_number, ev.timestamp_year, newLocId, newChapId, ev.is_death_event]
        );
      }

      // 6. Clone Event Participants
      for (const oldEvId of Object.keys(eventMap)) {
        const newEvId = eventMap[oldEvId];
        const parts = await tx.query<EventParticipant>(
          'SELECT * FROM event_participants WHERE event_id = $1',
          [oldEvId]
        );
        for (const p of parts.rows) {
          const newCharId = charMap[p.character_id];
          if (newCharId) {
            await tx.query(
              `INSERT INTO event_participants (id, event_id, character_id, role, notes)
               VALUES ($1, $2, $3, $4, $5)`,
              [`part-${crypto.randomUUID().slice(0, 12)}`, newEvId, newCharId, p.role, p.notes]
            );
          }
        }
      }

      // 7. Clone Event Dependencies
      for (const oldEvId of Object.keys(eventMap)) {
        const newEvId = eventMap[oldEvId];
        const deps = await tx.query<EventDependency>(
          'SELECT * FROM event_dependencies WHERE event_id = $1',
          [oldEvId]
        );
        for (const d of deps.rows) {
          const newPredEvId = eventMap[d.predecessor_event_id];
          if (newPredEvId) {
            await tx.query(
              `INSERT INTO event_dependencies (id, event_id, predecessor_event_id, dependency_type)
               VALUES ($1, $2, $3, $4)`,
              [`dep-${crypto.randomUUID().slice(0, 12)}`, newEvId, newPredEvId, d.dependency_type]
            );
          }
        }
      }

      // 8. Clone Relationships
      const rels = await tx.query<Relationship>(
        'SELECT * FROM relationships WHERE universe_id = $1',
        [sourceUniverseId]
      );
      for (const r of rels.rows) {
        const newSrc = charMap[r.source_character_id];
        const newTgt = charMap[r.target_character_id];
        if (newSrc && newTgt) {
          await tx.query(
            `INSERT INTO relationships (id, universe_id, source_character_id, target_character_id, relationship_type, intensity, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [`rel-${crypto.randomUUID().slice(0, 12)}`, newUniverseId, newSrc, newTgt, r.relationship_type, r.intensity, r.notes]
          );
        }
      }

      // 9. Clone Secrets
      const secrets = await tx.query<Secret>(
        'SELECT * FROM secrets WHERE universe_id = $1',
        [sourceUniverseId]
      );
      for (const s of secrets.rows) {
        const newSecId = `sec-${crypto.randomUUID().slice(0, 12)}`;
        secretMap[s.id] = newSecId;
        await tx.query(
          `INSERT INTO secrets (id, universe_id, title, content, severity)
           VALUES ($1, $2, $3, $4, $5)`,
          [newSecId, newUniverseId, s.title, s.content, s.severity]
        );
      }

      // 10. Clone Character Secrets
      for (const oldSecId of Object.keys(secretMap)) {
        const newSecId = secretMap[oldSecId];
        const csList = await tx.query<CharacterSecret>(
          'SELECT * FROM character_secrets WHERE secret_id = $1',
          [oldSecId]
        );
        for (const cs of csList.rows) {
          const newCharId = charMap[cs.character_id];
          const newLearnEvId = cs.learned_at_event_id ? eventMap[cs.learned_at_event_id] || null : null;
          if (newCharId) {
            await tx.query(
              `INSERT INTO character_secrets (id, character_id, secret_id, learned_at_event_id, learned_year, notes)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [`csec-${crypto.randomUUID().slice(0, 12)}`, newCharId, newSecId, newLearnEvId, cs.learned_year, cs.notes]
            );
          }
        }
      }

      // 11. Clone Secret Events
      for (const oldSecId of Object.keys(secretMap)) {
        const newSecId = secretMap[oldSecId];
        const seList = await tx.query<SecretEventUsage>(
          'SELECT * FROM secret_events WHERE secret_id = $1',
          [oldSecId]
        );
        for (const se of seList.rows) {
          const newEvId = eventMap[se.event_id];
          const newCharId = se.character_id ? charMap[se.character_id] || null : null;
          if (newEvId) {
            await tx.query(
              `INSERT INTO secret_events (id, event_id, secret_id, character_id, usage_type)
               VALUES ($1, $2, $3, $4, $5)`,
              [`sev-${crypto.randomUUID().slice(0, 12)}`, newEvId, newSecId, newCharId, se.usage_type]
            );
          }
        }
      }

      // 12. Clone Continuity Findings
      const findings = await tx.query<ContinuityFinding>(
        'SELECT * FROM continuity_findings WHERE universe_id = $1',
        [sourceUniverseId]
      );
      for (const f of findings.rows) {
        await tx.query(
          `INSERT INTO continuity_findings (id, universe_id, rule_code, finding_type, severity, title, explanation, evidence_json, affected_entities_json, status, fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            `find-${crypto.randomUUID().slice(0, 12)}`,
            newUniverseId,
            f.rule_code,
            f.finding_type,
            f.severity,
            f.title,
            f.explanation,
            f.evidence_json,
            f.affected_entities_json,
            f.status,
            f.fingerprint,
          ]
        );
      }
    });

    const createdRes = await query<Universe>('SELECT * FROM universes WHERE id = $1', [newUniverseId]);
    return NextResponse.json({ universe: createdRes.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Duplication failed';
    console.error('Error duplicating universe:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
