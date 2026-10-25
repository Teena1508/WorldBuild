import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { POST as createUniverse } from '../src/app/api/universes/route';
import { DELETE as deleteUniverse } from '../src/app/api/universes/[id]/route';
import { POST as createCharacter } from '../src/app/api/universes/[id]/characters/route';
import { GET as getCharacter } from '../src/app/api/universes/[id]/characters/[characterId]/route';
import { GET as getLocations, POST as createLocation } from '../src/app/api/universes/[id]/locations/route';
import { POST as createChapter } from '../src/app/api/universes/[id]/chapters/route';
import { POST as createEvent } from '../src/app/api/universes/[id]/events/route';
import { PUT as updateEvent } from '../src/app/api/universes/[id]/events/[eventId]/route';
import { POST as createRelationship } from '../src/app/api/universes/[id]/relationships/route';
import { POST as createSecret } from '../src/app/api/universes/[id]/secrets/route';
import { GET as getSecret } from '../src/app/api/universes/[id]/secrets/[secretId]/route';
import { POST as addSecretKnowledge } from '../src/app/api/universes/[id]/secrets/[secretId]/knowledge/route';

describe('Phase 3: Universe Entity CRUD & Cross-Universe Integrity', () => {
  let primaryUniverseId: string;
  let alienUniverseId: string;

  let charAId: string;
  let charBId: string;
  let alienCharId: string;
  let locId: string;
  let chapId: string;
  let event1Id: string;
  let event2Id: string;
  let secretId: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();

    // 1. Create primary test universe
    const u1Req = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Primary Test Continuum',
        description: 'Continuum for testing Phase 3 CRUD workflows',
      }),
    });
    const u1Res = await createUniverse(u1Req);
    const u1Data = await u1Res.json();
    primaryUniverseId = u1Data.universe.id;

    // 2. Create alien test universe (to test cross-universe integrity rejection)
    const u2Req = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Alien Parallel Realm',
        description: 'Foreign realm to test cross-universe contamination rejection',
      }),
    });
    const u2Res = await createUniverse(u2Req);
    const u2Data = await u2Res.json();
    alienUniverseId = u2Data.universe.id;

    // Create an alien character in alien universe
    const alienCharReq = new Request(`http://localhost:3000/api/universes/${alienUniverseId}/characters`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Alien Invader Xylar',
        bio: 'From a different continuum entirely.',
      }),
    });
    const alienCharRes = await createCharacter(alienCharReq, { params: Promise.resolve({ id: alienUniverseId }) });
    const alienCharData = await alienCharRes.json();
    alienCharId = alienCharData.character.id;
  });

  after(async () => {
    // Cleanup test universes
    if (primaryUniverseId) {
      await query('DELETE FROM universes WHERE id = $1', [primaryUniverseId]);
    }
    if (alienUniverseId) {
      await query('DELETE FROM universes WHERE id = $1', [alienUniverseId]);
    }
  });

  test('Characters CRUD & lifespan validation', async () => {
    const params = Promise.resolve({ id: primaryUniverseId });

    // 1. Invalid lifespan: death before birth
    const invalidLifeReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/characters`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Paradox Walker',
        bio: 'Born after dying',
        birth_year: 350,
        death_year: 300,
      }),
    });
    const invalidLifeRes = await createCharacter(invalidLifeReq, { params });
    assert.strictEqual(invalidLifeRes.status, 400);

    // 2. Valid character A creation
    const charAReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/characters`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Archivist Kenneth',
        epithet: 'The Starlight Scribe',
        bio: 'Chronicler of the high spires.',
        birth_year: 280,
        death_year: 360,
        status: 'alive',
      }),
    });
    const charARes = await createCharacter(charAReq, { params });
    assert.strictEqual(charARes.status, 201);
    const charAData = await charARes.json();
    charAId = charAData.character.id;
    assert.strictEqual(charAData.character.name, 'Archivist Kenneth');

    // 3. Valid character B creation
    const charBReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/characters`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'High Priestess Lyra',
        bio: 'Keeper of celestial leylines.',
        birth_year: 295,
        status: 'alive',
      }),
    });
    const charBRes = await createCharacter(charBReq, { params });
    const charBData = await charBRes.json();
    charBId = charBData.character.id;

    // 4. Read character detail
    const detailReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/characters/${charAId}`);
    const detailRes = await getCharacter(detailReq, { params: Promise.resolve({ id: primaryUniverseId, characterId: charAId }) });
    assert.strictEqual(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.strictEqual(detailData.character.id, charAId);
  });

  test('Locations CRUD', async () => {
    const params = Promise.resolve({ id: primaryUniverseId });
    const locReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/locations`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'The Astral Observatorium',
        realm: 'Celestial Firmament',
        description: 'A spiraling spire above the silver clouds.',
        coordinates_x: 45,
        coordinates_y: 80,
      }),
    });
    const locRes = await createLocation(locReq, { params });
    assert.strictEqual(locRes.status, 201);
    const locData = await locRes.json();
    locId = locData.location.id;

    const listRes = await getLocations(new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/locations`), { params });
    const listData = await listRes.json();
    assert.strictEqual(listData.locations.length, 1);
  });

  test('Chapters CRUD with unique sequence numbers', async () => {
    const params = Promise.resolve({ id: primaryUniverseId });

    // Chapter 1
    const ch1Req = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/chapters`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Starlight Accord',
        sequence_number: 1,
        summary: 'First congregation of the astral orders.',
      }),
    });
    const ch1Res = await createChapter(ch1Req, { params });
    assert.strictEqual(ch1Res.status, 201);
    const ch1Data = await ch1Res.json();
    chapId = ch1Data.chapter.id;

    // Duplicate sequence number rejected
    const dupReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/chapters`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Conflicting Chapter',
        sequence_number: 1,
        summary: 'Trying to occupy sequence 1 again.',
      }),
    });
    const dupRes = await createChapter(dupReq, { params });
    assert.strictEqual(dupRes.status, 400);
  });

  test('Events CRUD & Cross-Universe Rejection', async () => {
    const params = Promise.resolve({ id: primaryUniverseId });

    // 1. Cross-universe participant rejection: Alien character cannot be added to primary universe event!
    const crossAlienReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Illegal Incursion',
        timestamp_year: 310,
        participants: [{ character_id: alienCharId, role: 'Infiltrator' }],
      }),
    });
    const crossAlienRes = await createEvent(crossAlienReq, { params });
    assert.strictEqual(crossAlienRes.status, 400);
    const crossAlienData = await crossAlienRes.json();
    assert.ok(crossAlienData.error.includes('does not belong'));

    // 2. Valid Event 1
    const ev1Req = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Great Celestial Synod',
        timestamp_year: 300,
        sequence_number: 1,
        location_id: locId,
        chapter_id: chapId,
        participants: [
          { character_id: charAId, role: 'High Scribe' },
          { character_id: charBId, role: 'Presiding Priestess' },
        ],
      }),
    });
    const ev1Res = await createEvent(ev1Req, { params });
    assert.strictEqual(ev1Res.status, 201);
    const ev1Data = await ev1Res.json();
    event1Id = ev1Data.event.id;

    // 3. Valid Event 2 depending on Event 1
    const ev2Req = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Signing of the Astral Covenant',
        timestamp_year: 305,
        sequence_number: 2,
        location_id: locId,
        dependencies: [{ predecessor_event_id: event1Id, dependency_type: 'requires_predecessor' }],
      }),
    });
    const ev2Res = await createEvent(ev2Req, { params });
    assert.strictEqual(ev2Res.status, 201);
    const ev2Data = await ev2Res.json();
    event2Id = ev2Data.event.id;

    // 4. Dependency cycle detection: Event 1 cannot depend on Event 2 when Event 2 depends on Event 1!
    const cycleReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/events/${event1Id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: 'The Great Celestial Synod',
        dependencies: [{ predecessor_event_id: event2Id }],
      }),
    });
    const cycleRes = await updateEvent(cycleReq, { params: Promise.resolve({ id: primaryUniverseId, eventId: event1Id }) });
    assert.strictEqual(cycleRes.status, 400);
    const cycleData = await cycleRes.json();
    assert.ok(cycleData.error.includes('cycle'));
  });

  test('Relationships CRUD & Cross-Universe Rejection', async () => {
    const params = Promise.resolve({ id: primaryUniverseId });

    // 1. Self relationship rejection
    const selfReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        source_character_id: charAId,
        target_character_id: charAId,
        relationship_type: 'allied_with',
      }),
    });
    const selfRes = await createRelationship(selfReq, { params });
    assert.strictEqual(selfRes.status, 400);

    // 2. Cross-universe relationship rejection (linking local char to alien char)
    const crossReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        source_character_id: charAId,
        target_character_id: alienCharId,
        relationship_type: 'rival_of',
      }),
    });
    const crossRes = await createRelationship(crossReq, { params });
    assert.strictEqual(crossRes.status, 400);

    // 3. Valid relationship
    const validRelReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        source_character_id: charAId,
        target_character_id: charBId,
        relationship_type: 'counselor_to',
        intensity: 8,
        notes: 'Advised on the starlight alignments for 20 years.',
      }),
    });
    const validRelRes = await createRelationship(validRelReq, { params });
    assert.strictEqual(validRelRes.status, 201);
  });

  test('Secrets & Knowledge CRUD', async () => {
    const params = Promise.resolve({ id: primaryUniverseId });

    // 1. Create Secret
    const secReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/secrets`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Severed Astral Thread',
        content: 'The stars were not born of natural fire, but forged in the Adamantine Crucible.',
        severity: 'cosmic',
      }),
    });
    const secRes = await createSecret(secReq, { params });
    assert.strictEqual(secRes.status, 201);
    const secData = await secRes.json();
    secretId = secData.secret.id;

    // 2. Record Knowledge (Archivist Kenneth learns it)
    const knowReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/secrets/${secretId}/knowledge`, {
      method: 'POST',
      body: JSON.stringify({
        character_id: charAId,
        learned_year: 300,
        learned_at_event_id: event1Id,
        notes: 'Discovered in the lower vaults.',
      }),
    });
    const knowRes = await addSecretKnowledge(knowReq, { params: Promise.resolve({ id: primaryUniverseId, secretId }) });
    assert.strictEqual(knowRes.status, 201);

    // 3. Cross-universe knowledge rejection (Alien character cannot learn primary secret)
    const crossKnowReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/secrets/${secretId}/knowledge`, {
      method: 'POST',
      body: JSON.stringify({
        character_id: alienCharId,
      }),
    });
    const crossKnowRes = await addSecretKnowledge(crossKnowReq, { params: Promise.resolve({ id: primaryUniverseId, secretId }) });
    assert.strictEqual(crossKnowRes.status, 400);

    // 4. Inspect Secret Details
    const secretDetailReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/secrets/${secretId}`);
    const secretDetailRes = await getSecret(secretDetailReq, { params: Promise.resolve({ id: primaryUniverseId, secretId }) });
    assert.strictEqual(secretDetailRes.status, 200);
    const secretDetailData = await secretDetailRes.json();
    assert.strictEqual(secretDetailData.secret.known_by.length, 1);
    assert.strictEqual(secretDetailData.secret.known_by[0].character_name, 'Archivist Kenneth');
  });

  after(async () => {
    if (primaryUniverseId) {
      const delReq1 = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}`, { method: 'DELETE' });
      await deleteUniverse(delReq1, { params: Promise.resolve({ id: primaryUniverseId }) });
    }
    if (alienUniverseId) {
      const delReq2 = new Request(`http://localhost:3000/api/universes/${alienUniverseId}`, { method: 'DELETE' });
      await deleteUniverse(delReq2, { params: Promise.resolve({ id: alienUniverseId }) });
    }
    await closeDatabase();
  });
});
