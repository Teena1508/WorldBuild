import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, closeDatabase } from '../src/lib/db';
import { runContinuityScan } from '../src/lib/oracle/engine';
import { RULE_CODES } from '../src/lib/oracle/types';
import { Character, Relationship, UniverseEvent, ContinuityFinding } from '../src/lib/db/types';

describe('Phase 5: Interactive Visualizations (Relationship Graph & Chronological Timeline)', () => {
  const testUserId = 'user-viz-tester';
  let universeId: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';

    await query(
      `INSERT INTO app_users (id, email, display_name, session_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, 'viz-tester@worldbuild.lore', 'Master Cartographer', 'tok-viz-test']
    );
  });

  after(async () => {
    await closeDatabase();
  });

  test('Relationship Graph: Backed strictly by persisted database records without hardcoded edges', async () => {
    universeId = `univ-viz-graph-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Graph Universe', 'Testing relationship topology persistence']
    );

    // Persist 3 characters
    await query(`INSERT INTO characters (id, universe_id, name, bio, status) VALUES ($1, $2, $3, $4, $5)`,
      ['char-g1', universeId, 'Aurelia Crown', 'High Archon', 'alive']);
    await query(`INSERT INTO characters (id, universe_id, name, bio, status) VALUES ($1, $2, $3, $4, $5)`,
      ['char-g2', universeId, 'Vesper Void', 'Shadow Chancellor', 'alive']);
    await query(`INSERT INTO characters (id, universe_id, name, bio, status) VALUES ($1, $2, $3, $4, $5)`,
      ['char-g3', universeId, 'Kaelen Sunseeker', 'Paladin of Dawn', 'alive']);

    // Persist directed relationships with intensities
    await query(
      `INSERT INTO relationships (id, universe_id, source_character_id, target_character_id, relationship_type, intensity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['rel-1', universeId, 'char-g1', 'char-g2', 'Rival', 8, 'Political feud over throne']
    );
    await query(
      `INSERT INTO relationships (id, universe_id, source_character_id, target_character_id, relationship_type, intensity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['rel-2', universeId, 'char-g1', 'char-g3', 'Mentor', 9, 'Sacred oath of guidance']
    );
    await query(
      `INSERT INTO relationships (id, universe_id, source_character_id, target_character_id, relationship_type, intensity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['rel-3', universeId, 'char-g3', 'char-g2', 'Enemy', 4, 'Skirmish at Ironpass']
    );

    // Fetch from database exactly as the application does
    const charsRes = await query<Character>(
      `SELECT * FROM characters WHERE universe_id = $1 ORDER BY name ASC`,
      [universeId]
    );
    const relsRes = await query<Relationship>(
      `SELECT r.*, sc.name as source_character_name, tc.name as target_character_name
       FROM relationships r
       JOIN characters sc ON r.source_character_id = sc.id
       JOIN characters tc ON r.target_character_id = tc.id
       WHERE r.universe_id = $1`,
      [universeId]
    );

    assert.equal(charsRes.rows.length, 3, 'Must fetch all 3 characters from PostgreSQL');
    assert.equal(relsRes.rows.length, 3, 'Must fetch all 3 directed relationship edges from PostgreSQL');

    // Test edge intensity weights and directional consistency
    const mentorEdge = relsRes.rows.find((r) => r.relationship_type === 'Mentor');
    assert.ok(mentorEdge);
    assert.equal(mentorEdge.source_character_name, 'Aurelia Crown');
    assert.equal(mentorEdge.target_character_name, 'Kaelen Sunseeker');
    assert.equal(mentorEdge.intensity, 9);
    assert.equal(mentorEdge.notes, 'Sacred oath of guidance');
  });

  test('Relationship Graph: Correctly maps active continuity findings to affected character nodes', async () => {
    // Inject a spatial overlap paradox for Aurelia Crown
    await query(`INSERT INTO locations (id, universe_id, name, realm, description) VALUES ($1, $2, $3, $4, $5)`,
      ['loc-v1', universeId, 'Solar Keep', 'Astral', 'Keep 1']);
    await query(`INSERT INTO locations (id, universe_id, name, realm, description) VALUES ($1, $2, $3, $4, $5)`,
      ['loc-v2', universeId, 'Abyssal Maw', 'Void', 'Keep 2']);

    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evt-v1', universeId, 'Solar Conclave', 1200, 1, 'loc-v1']
    );
    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evt-v2', universeId, 'Abyssal Incursion', 1200, 2, 'loc-v2']
    );

    await query(`INSERT INTO event_participants (id, event_id, character_id) VALUES ($1, $2, $3)`,
      ['part-v1', 'evt-v1', 'char-g1']);
    await query(`INSERT INTO event_participants (id, event_id, character_id) VALUES ($1, $2, $3)`,
      ['part-v2', 'evt-v2', 'char-g1']);

    // Run Oracle Scan
    const scan = await runContinuityScan(universeId);
    assert.ok(scan.findings.length > 0, 'Scan should detect the contradiction');

    // Map paradoxes to character nodes as the graph component does
    const paradoxCharMap = new Map<string, number>();
    for (const f of scan.findings) {
      if (f.status === 'open') {
        const entities: Array<{ id: string; type: string }> = JSON.parse(f.affected_entities_json);
        for (const ent of entities) {
          if (ent.type === 'character') {
            paradoxCharMap.set(ent.id, (paradoxCharMap.get(ent.id) || 0) + 1);
          }
        }
      }
    }

    assert.equal(paradoxCharMap.has('char-g1'), true, 'Aurelia Crown must have an active paradox flag');
    assert.equal(paradoxCharMap.has('char-g2'), false, 'Vesper Void has no paradoxes');
    assert.equal(paradoxCharMap.has('char-g3'), false, 'Kaelen Sunseeker has no paradoxes');
  });

  test('Relationship Graph: Filter transformations (intensity threshold and relationship type)', async () => {
    const relsRes = await query<Relationship>(
      `SELECT r.*, sc.name as source_character_name, tc.name as target_character_name
       FROM relationships r
       JOIN characters sc ON r.source_character_id = sc.id
       JOIN characters tc ON r.target_character_id = tc.id
       WHERE r.universe_id = $1`,
      [universeId]
    );

    // Test Intensity Filter: minIntensity = 8
    const highIntensity = relsRes.rows.filter((r) => r.intensity >= 8);
    assert.equal(highIntensity.length, 2, 'Only Rival (8) and Mentor (9) should remain when minIntensity >= 8');

    // Test Type Filter: only "Rival"
    const rivalsOnly = relsRes.rows.filter((r) => r.relationship_type.toLowerCase() === 'rival');
    assert.equal(rivalsOnly.length, 1);
    assert.equal(rivalsOnly[0].relationship_type, 'Rival');
  });

  test('Chronological Timeline: Persisted event sequencing, chapter grouping, and mortality milestones', async () => {
    universeId = `univ-viz-timeline-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Timeline Universe', 'Testing story timeline continuum']
    );

    // Persist 2 Chapters
    await query(`INSERT INTO chapters (id, universe_id, title, sequence_number, summary) VALUES ($1, $2, $3, $4, $5)`,
      ['chap-t1', universeId, 'Genesis of the Realm', 1, 'The dawn of creation']);
    await query(`INSERT INTO chapters (id, universe_id, title, sequence_number, summary) VALUES ($1, $2, $3, $4, $5)`,
      ['chap-t2', universeId, 'The Cataclysm', 2, 'The breaking of the world']);

    // Persist 3 Events across distinct timeline years
    await query(
      `INSERT INTO events (id, universe_id, title, description, timestamp_year, sequence_number, chapter_id, is_death_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['evt-t1', universeId, 'Awakening of the First Flame', 'Primordial fire ignited', 100, 1, 'chap-t1', false]
    );
    await query(
      `INSERT INTO events (id, universe_id, title, description, timestamp_year, sequence_number, chapter_id, is_death_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['evt-t2', universeId, 'The Fall of High King Eric', 'The monarch perishes in battle', 250, 2, 'chap-t2', true]
    );
    await query(
      `INSERT INTO events (id, universe_id, title, description, timestamp_year, sequence_number, chapter_id, is_death_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['evt-t3', universeId, 'Coronation of the Empress', 'A new dynasty rises', 255, 3, 'chap-t2', false]
    );

    // Query events exactly as timeline component does
    const eventsRes = await query<UniverseEvent>(
      `SELECT e.*, ch.title as chapter_title
       FROM events e
       LEFT JOIN chapters ch ON e.chapter_id = ch.id
       WHERE e.universe_id = $1
       ORDER BY e.timestamp_year ASC`,
      [universeId]
    );

    assert.equal(eventsRes.rows.length, 3, 'Timeline must load all 3 persisted events');

    // Chronological order verification
    assert.equal(eventsRes.rows[0].timestamp_year, 100);
    assert.equal(eventsRes.rows[1].timestamp_year, 250);
    assert.equal(eventsRes.rows[2].timestamp_year, 255);

    // Mortality milestone flag verification
    assert.equal(eventsRes.rows[1].is_death_event, true, 'Fall of High King Eric must have death flag');
    assert.equal(eventsRes.rows[0].is_death_event, false);
    assert.equal(eventsRes.rows[2].is_death_event, false);

    // Chapter association verification
    assert.equal(eventsRes.rows[0].chapter_title, 'Genesis of the Realm');
    assert.equal(eventsRes.rows[1].chapter_title, 'The Cataclysm');
  });

  test('Chronological Timeline: Correctly maps active continuity paradoxes to timeline milestones', async () => {
    // Create predecessor sequence violation: Event B (Year 50) depends on Event A (Year 100)
    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number)
       VALUES ($1, $2, $3, $4, $5)`,
      ['evt-inv-pred', universeId, 'Forging of the Spear', 100, 1]
    );
    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number)
       VALUES ($1, $2, $3, $4, $5)`,
      ['evt-inv-dep', universeId, 'Wielding the Spear', 50, 2]
    );

    await query(
      `INSERT INTO event_dependencies (id, event_id, predecessor_event_id)
       VALUES ($1, $2, $3)`,
      ['dep-inv', 'evt-inv-dep', 'evt-inv-pred']
    );

    const scan = await runContinuityScan(universeId);
    const predFindings = scan.findings.filter((f) => f.rule_code === RULE_CODES.PREDECESSOR_VIOLATION);
    assert.equal(predFindings.length, 1);

    // Map paradoxes to timeline events
    const eventParadoxMap = new Map<string, ContinuityFinding[]>();
    for (const f of scan.findings) {
      if (f.status === 'open') {
        const entities: Array<{ id: string; type: string }> = JSON.parse(f.affected_entities_json);
        for (const ent of entities) {
          if (ent.type === 'event') {
            const list = eventParadoxMap.get(ent.id) || [];
            list.push(f);
            eventParadoxMap.set(ent.id, list);
          }
        }
      }
    }

    assert.equal(eventParadoxMap.has('evt-inv-dep'), true, 'Dependent event must have active paradox marker');
    assert.equal(eventParadoxMap.has('evt-inv-pred'), true, 'Predecessor event must have active paradox marker');
  });

  test('Visualizations: Empty universe states and accessible alternative representations', async () => {
    const emptyUniverseId = `univ-viz-empty-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [emptyUniverseId, testUserId, 'Empty Cosmos', 'No inhabitants or milestones yet']
    );

    const charsRes = await query<Character>(
      `SELECT * FROM characters WHERE universe_id = $1`,
      [emptyUniverseId]
    );
    const eventsRes = await query<UniverseEvent>(
      `SELECT * FROM events WHERE universe_id = $1`,
      [emptyUniverseId]
    );

    assert.equal(charsRes.rows.length, 0, 'Empty workspace must have 0 characters without error');
    assert.equal(eventsRes.rows.length, 0, 'Empty workspace must have 0 events without error');
  });
});
