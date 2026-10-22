import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { GET as getUniverses, POST as createUniverse } from '../src/app/api/universes/route';
import { GET as getUniverse, PUT as updateUniverse, DELETE as deleteUniverse } from '../src/app/api/universes/[id]/route';
import { POST as createCharacter } from '../src/app/api/universes/[id]/characters/route';
import { GET as getCharacter, PUT as updateCharacter, DELETE as deleteCharacter } from '../src/app/api/universes/[id]/characters/[characterId]/route';
import { POST as createLocation } from '../src/app/api/universes/[id]/locations/route';
import { POST as createChapter } from '../src/app/api/universes/[id]/chapters/route';
import { POST as createEvent } from '../src/app/api/universes/[id]/events/route';
import { GET as getEvent } from '../src/app/api/universes/[id]/events/[eventId]/route';
import { POST as createRelationship } from '../src/app/api/universes/[id]/relationships/route';
import { POST as createSecret } from '../src/app/api/universes/[id]/secrets/route';
import { GET as getSecret } from '../src/app/api/universes/[id]/secrets/[secretId]/route';
import { POST as grantSecretKnowledge, DELETE as revokeSecretKnowledge } from '../src/app/api/universes/[id]/secrets/[secretId]/knowledge/route';

describe('Demo-to-Production End-to-End Workflow & Core Integrity Audit', () => {
  let createdUniverseId: string;
  let alienUniverseId: string;
  let char1Id: string;
  let char2Id: string;
  let locId: string;
  let chapId: string;
  let event1Id: string;
  let event2Id: string;
  let relId: string;
  let secretId: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();
  });

  after(async () => {
    if (createdUniverseId) {
      await query('DELETE FROM universes WHERE id = $1', [createdUniverseId]);
    }
    if (alienUniverseId) {
      await query('DELETE FROM universes WHERE id = $1', [alienUniverseId]);
    }
    await closeDatabase();
  });

  test('Step 1 & 2: Open World Vault & Create Persistent Universe', async () => {
    // Step 1: Open vault - returns exemplar archive
    const vaultReq = new Request('http://localhost:3000/api/universes');
    const vaultRes = await getUniverses(vaultReq);
    assert.strictEqual(vaultRes.status, 200);
    const vaultData = await vaultRes.json();
    assert.ok(Array.isArray(vaultData.universes));
    const exemplar = vaultData.universes.find((u: { is_example: boolean }) => u.is_example);
    assert.ok(exemplar, 'Exemplar demo universe must exist out-of-the-box');

    // Step 2: Create a universe
    const createReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Sunken Scriptorium of Val-Morgath',
        description: 'An ancient underwater citadel where heretic cartographers draft forbidden star charts.',
      }),
    });
    const createRes = await createUniverse(createReq);
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    assert.ok(createData.universe.id);
    createdUniverseId = createData.universe.id;

    // Verify in database
    const dbCheck = await query('SELECT * FROM universes WHERE id = $1', [createdUniverseId]);
    assert.strictEqual(dbCheck.rows.length, 1);
  });

  test('Step 3: Open Universe Workspace & Retrieve Live Record', async () => {
    const params = Promise.resolve({ id: createdUniverseId });
    const req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}`);
    const res = await getUniverse(req, { params });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.universe.id, createdUniverseId);
    assert.strictEqual(data.isOwner, true);
  });

  test('Step 4: Create Character & Edit Details with Exception Notes', async () => {
    const params = Promise.resolve({ id: createdUniverseId });

    // Create Character 1
    const char1Req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/characters`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Archivist Thalor',
        epithet: 'The Blind Astrologer',
        bio: 'Chief cataloger of celestial conjunctions in the lower depths.',
        birth_year: 240,
        death_year: null,
        status: 'alive',
      }),
    });
    const char1Res = await createCharacter(char1Req, { params });
    assert.strictEqual(char1Res.status, 201);
    const char1Data = await char1Res.json();
    char1Id = char1Data.character.id;

    // Create Character 2
    const char2Req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/characters`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Lady Sorsha',
        epithet: 'Warden of the Glass Gates',
        bio: 'Guardian of the submerged portal.',
        birth_year: 260,
        death_year: 320,
        death_confirmed: true,
        death_exception_notes: 'Manifests as an astral phantom in the lower corridors',
        status: 'deceased',
      }),
    });
    const char2Res = await createCharacter(char2Req, { params });
    assert.strictEqual(char2Res.status, 201);
    const char2Data = await char2Res.json();
    char2Id = char2Data.character.id;

    // Edit Character 1 Details
    const editParams = Promise.resolve({ id: createdUniverseId, characterId: char1Id });
    const editReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/characters/${char1Id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Grand Archivist Thalor',
        bio: 'Promoted to Grand Archivist after discovering the sunken obelisk.',
      }),
    });
    const editRes = await updateCharacter(editReq, { params: editParams });
    assert.strictEqual(editRes.status, 200);

    // Verify updated details from database
    const verifyReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/characters/${char1Id}`);
    const verifyRes = await getCharacter(verifyReq, { params: editParams });
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.character.name, 'Grand Archivist Thalor');
  });

  test('Step 5 & 6: Create Location, Chapter, & Event with Participants and Dependencies', async () => {
    const uParams = Promise.resolve({ id: createdUniverseId });

    // Step 5a: Create Location
    const locReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/locations`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'The Abyssal Observatory',
        realm: 'Lower Aquifers',
        description: 'A pressurized domed amphitheater with telescopes pointed into the depths.',
        coordinates_x: 350,
        coordinates_y: 620,
      }),
    });
    const locRes = await createLocation(locReq, { params: uParams });
    assert.strictEqual(locRes.status, 201);
    const locData = await locRes.json();
    locId = locData.location.id;

    // Step 5b: Create Chapter
    const chapReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/chapters`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Canto I: The Obsidian Tide',
        sequence_number: 1,
        summary: 'Thalor and Sorsha prepare the defenses as the sea rises.',
      }),
    });
    const chapRes = await createChapter(chapReq, { params: uParams });
    assert.strictEqual(chapRes.status, 201);
    const chapData = await chapRes.json();
    chapId = chapData.chapter.id;

    // Step 5c: Create Event 1 (Predecessor)
    const ev1Req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Great Tidal Oscillation',
        description: 'The submerged tides reverse, exposing the entrance to the lower observatory.',
        timestamp_year: 290,
        sequence_number: 1,
        location_id: locId,
        chapter_id: chapId,
        is_death_event: false,
        participants: [
          { character_id: char1Id, role: 'Lead Observer' },
        ],
      }),
    });
    const ev1Res = await createEvent(ev1Req, { params: uParams });
    assert.strictEqual(ev1Res.status, 201);
    const ev1Data = await ev1Res.json();
    event1Id = ev1Data.event.id;

    // Step 6: Create Event 2 associating characters, location, chapter, and predecessor dependency
    const ev2Req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Breach of the Outer Dome',
        description: 'Water breaches the pressurized seal; Sorsha makes her final stand.',
        timestamp_year: 320,
        sequence_number: 2,
        location_id: locId,
        chapter_id: chapId,
        is_death_event: true,
        participants: [
          { character_id: char1Id, role: 'Survivor' },
          { character_id: char2Id, role: 'Fallen Defender' },
        ],
        dependencies: [
          { predecessor_event_id: event1Id, dependency_type: 'requires_predecessor' },
        ],
      }),
    });
    const ev2Res = await createEvent(ev2Req, { params: uParams });
    assert.strictEqual(ev2Res.status, 201);
    const ev2Data = await ev2Res.json();
    event2Id = ev2Data.event.id;

    // Verify event details, participants, and dependencies from database
    const evCheckParams = Promise.resolve({ id: createdUniverseId, eventId: event2Id });
    const evCheckReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/events/${event2Id}`);
    const evCheckRes = await getEvent(evCheckReq, { params: evCheckParams });
    const evCheckData = await evCheckRes.json();

    assert.strictEqual(evCheckData.event.is_death_event, true);
    assert.strictEqual(evCheckData.event.location_name, 'The Abyssal Observatory');
    assert.strictEqual(evCheckData.event.chapter_title, 'Canto I: The Obsidian Tide');
    assert.strictEqual(evCheckData.event.participants.length, 2);
    assert.strictEqual(evCheckData.event.dependencies.length, 1);
    assert.strictEqual(evCheckData.event.dependencies[0].predecessor_title, 'The Great Tidal Oscillation');
  });

  test('Step 7: Create Relationships & Secrets with Character Knowledge', async () => {
    const uParams = Promise.resolve({ id: createdUniverseId });

    // Create Relationship
    const relReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        source_character_id: char1Id,
        target_character_id: char2Id,
        relationship_type: 'sworn_protector_of',
        intensity: 8,
        notes: 'Sorsha pledged to protect Thalor until the stars aligned.',
      }),
    });
    const relRes = await createRelationship(relReq, { params: uParams });
    assert.strictEqual(relRes.status, 201);
    const relData = await relRes.json();
    relId = relData.relationship.id;

    // Create Secret
    const secReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/secrets`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Drowned Constellation',
        content: 'A secret chart showing stars invisible from the surface of the realm.',
        severity: 'forbidden',
      }),
    });
    const secRes = await createSecret(secReq, { params: uParams });
    assert.strictEqual(secRes.status, 201);
    const secData = await secRes.json();
    secretId = secData.secret.id;

    // Grant Secret Knowledge to Thalor
    const kParams = Promise.resolve({ id: createdUniverseId, secretId });
    const grantReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/secrets/${secretId}/knowledge`, {
      method: 'POST',
      body: JSON.stringify({
        character_id: char1Id,
        learned_year: 285,
        notes: 'Discovered in the ancient scrolls.',
      }),
    });
    const grantRes = await grantSecretKnowledge(grantReq, { params: kParams });
    assert.strictEqual(grantRes.status, 201);

    // Verify secret knowledge recorded in database
    const secCheckReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/secrets/${secretId}`);
    const secCheckRes = await getSecret(secCheckReq, { params: kParams });
    const secCheckData = await secCheckRes.json();
    assert.strictEqual(secCheckData.secret.known_by.length, 1);
    assert.strictEqual(secCheckData.secret.known_by[0].character_name, 'Grand Archivist Thalor');
  });

  test('Step 8: Verify Complete Database Persistence and Foreign Key Integrity', async () => {
    // Assert all tables contain the persisted records
    const univDb = await query('SELECT * FROM universes WHERE id = $1', [createdUniverseId]);
    assert.strictEqual(univDb.rows.length, 1);

    const charsDb = await query('SELECT * FROM characters WHERE universe_id = $1', [createdUniverseId]);
    assert.strictEqual(charsDb.rows.length, 2);

    const locsDb = await query('SELECT * FROM locations WHERE universe_id = $1', [createdUniverseId]);
    assert.strictEqual(locsDb.rows.length, 1);

    const chapsDb = await query('SELECT * FROM chapters WHERE universe_id = $1', [createdUniverseId]);
    assert.strictEqual(chapsDb.rows.length, 1);

    const eventsDb = await query('SELECT * FROM events WHERE universe_id = $1', [createdUniverseId]);
    assert.strictEqual(eventsDb.rows.length, 2);

    const partsDb = await query('SELECT * FROM event_participants WHERE event_id = $1', [event2Id]);
    assert.strictEqual(partsDb.rows.length, 2);

    const depsDb = await query('SELECT * FROM event_dependencies WHERE event_id = $1', [event2Id]);
    assert.strictEqual(depsDb.rows.length, 1);

    const relsDb = await query('SELECT * FROM relationships WHERE id = $1', [relId]);
    assert.strictEqual(relsDb.rows.length, 1);

    const secretsDb = await query('SELECT * FROM secrets WHERE id = $1', [secretId]);
    assert.strictEqual(secretsDb.rows.length, 1);

    const charSecDb = await query('SELECT * FROM character_secrets WHERE secret_id = $1', [secretId]);
    assert.strictEqual(charSecDb.rows.length, 1);
  });

  test('Step 9: Edit and Delete Records & Verify Cascades', async () => {
    // Revoke secret knowledge
    const kParams = Promise.resolve({ id: createdUniverseId, secretId });
    const revokeReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/secrets/${secretId}/knowledge?characterId=${char1Id}`, {
      method: 'DELETE',
    });
    const revokeRes = await revokeSecretKnowledge(revokeReq, { params: kParams });
    assert.strictEqual(revokeRes.status, 200);

    const checkRevoked = await query('SELECT * FROM character_secrets WHERE secret_id = $1 AND character_id = $2', [secretId, char1Id]);
    assert.strictEqual(checkRevoked.rows.length, 0);

    // Delete character 2 (cascades to relationships and event participants)
    const char2Params = Promise.resolve({ id: createdUniverseId, characterId: char2Id });
    const delCharReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/characters/${char2Id}`, {
      method: 'DELETE',
    });
    const delCharRes = await deleteCharacter(delCharReq, { params: char2Params });
    assert.strictEqual(delCharRes.status, 200);

    // Verify relationship cascaded away
    const checkRel = await query('SELECT * FROM relationships WHERE id = $1', [relId]);
    assert.strictEqual(checkRel.rows.length, 0);

    // Verify event participant cascaded away
    const checkPart = await query('SELECT * FROM event_participants WHERE event_id = $1 AND character_id = $2', [event2Id, char2Id]);
    assert.strictEqual(checkPart.rows.length, 0);
  });

  test('Step 10: Verify Cross-Universe Security & Modification Rejection', async () => {
    // Create an alien universe owned by another user
    const alienReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: { 'x-session-token': 'tok-test-12345' }, // usr-test-archivist
      body: JSON.stringify({
        title: 'Alien Citadel of the Second User',
        description: 'Continuum belonging to an entirely different user.',
      }),
    });
    const alienRes = await createUniverse(alienReq);
    assert.strictEqual(alienRes.status, 201);
    const alienData = await alienRes.json();
    alienUniverseId = alienData.universe.id;

    // 1. Primary user cannot delete alien universe
    const delAlienReq = new Request(`http://localhost:3000/api/universes/${alienUniverseId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
    });
    const delAlienRes = await deleteUniverse(delAlienReq, { params: Promise.resolve({ id: alienUniverseId }) });
    assert.strictEqual(delAlienRes.status, 403);

    // 2. Primary user cannot update alien universe metadata
    const updateAlienReq = new Request(`http://localhost:3000/api/universes/${alienUniverseId}`, {
      method: 'PUT',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({ title: 'Hacked Universe Title' }),
    });
    const updateAlienRes = await updateUniverse(updateAlienReq, { params: Promise.resolve({ id: alienUniverseId }) });
    assert.strictEqual(updateAlienRes.status, 403);

    // 3. Cannot create event in primary universe with location from alien universe
    const alienLoc = await query<{ id: string }>(
      `INSERT INTO locations (id, universe_id, name, realm, description)
       VALUES ('loc-alien-realm', $1, 'Alien Crystal Crater', 'Foreign Plane', 'Contaminated location')
       RETURNING id`,
      [alienUniverseId]
    );
    const alienLocId = alienLoc.rows[0].id;

    const crossLocReq = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Contaminated Event',
        timestamp_year: 350,
        location_id: alienLocId,
      }),
    });
    const crossLocRes = await createEvent(crossLocReq, { params: Promise.resolve({ id: createdUniverseId }) });
    assert.strictEqual(crossLocRes.status, 400);
    const crossLocData = await crossLocRes.json();
    assert.match(crossLocData.error, /does not belong to this universe/);
  });
});
