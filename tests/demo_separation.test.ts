import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers, SYSTEM_USER_ID } from '../src/lib/auth/session';
import { ensureDefaultUniverses, EXEMPLAR_UNIVERSE_ID } from '../src/lib/db/seed';
import { GET as getUniverses, POST as createUniverse } from '../src/app/api/universes/route';
import { GET as getUniverse, PUT as updateUniverse, DELETE as deleteUniverse } from '../src/app/api/universes/[id]/route';
import { POST as duplicateUniverse } from '../src/app/api/universes/[id]/duplicate/route';
import { POST as createCharacter } from '../src/app/api/universes/[id]/characters/route';
import { POST as createLocation } from '../src/app/api/universes/[id]/locations/route';
import { POST as createChapter } from '../src/app/api/universes/[id]/chapters/route';
import { POST as createEvent } from '../src/app/api/universes/[id]/events/route';
import { POST as createRelationship } from '../src/app/api/universes/[id]/relationships/route';
import { POST as createSecret } from '../src/app/api/universes/[id]/secrets/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import { POST as loginUser } from '../src/app/api/auth/login/route';
import { POST as registerUser } from '../src/app/api/auth/register/route';
import { POST as logoutUser } from '../src/app/api/auth/logout/route';

describe('Demo Separation & Production First-Time User Experience', () => {
  const NEW_USER_ID = 'usr-fresh-scribe-01';
  const NEW_USER_TOKEN = 'tok-fresh-scribe-token';

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();

    // Register a clean first-time user who has never created a universe
    await query(
      `INSERT INTO app_users (id, email, display_name, session_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [NEW_USER_ID, 'fresh@sanctum.test', 'Fresh Scribe', NEW_USER_TOKEN]
    );

    // Ensure this new user starts with 0 personal universes
    await query('DELETE FROM universes WHERE user_id = $1', [NEW_USER_ID]);
  });

  after(async () => {
    await closeDatabase();
  });

  test('1. A user with no personal universes has 0 personal universes and sees empty state counts', async () => {
    const req = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const res = await getUniverses(req);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.user.id, NEW_USER_ID);
    assert.strictEqual(data.counts.personal, 0, 'First-time user should have exactly 0 personal universes');
    assert.strictEqual(data.personalUniverses.length, 0, 'personalUniverses array must be empty');

    // Confirm that the demo universe exists separately as an exemplar
    assert.ok(data.demoUniverse, 'Exemplar demo universe should be available');
    assert.strictEqual(data.demoUniverse.id, EXEMPLAR_UNIVERSE_ID);
    assert.strictEqual(data.demoUniverse.is_example, true);
    assert.strictEqual(data.counts.demo, 1);
  });

  test('2. The demo remains discoverable without appearing as a personal universe', async () => {
    // When requesting personal scope, the canonical demo is strictly excluded
    const req = new Request('http://localhost:3000/api/universes?scope=personal', {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const res = await getUniverses(req);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.universes.length, 0, 'Personal scope query must not include demo data');

    // Inspect canonical demo detail endpoint
    const demoReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}`, {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const demoRes = await getUniverse(demoReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(demoRes.status, 200);

    const demoData = await demoRes.json();
    assert.strictEqual(demoData.universe.id, EXEMPLAR_UNIVERSE_ID);
    assert.strictEqual(demoData.universe.is_example, true);
    assert.strictEqual(demoData.isOwner, false, 'User must not be marked as owner of the shared demo');
    assert.strictEqual(demoData.universe.user_id, SYSTEM_USER_ID, 'Demo must belong to system user');
  });

  let createdPersonalUnivId: string;

  test('3. Creating a universe creates a real, persistent personal universe owned by the user', async () => {
    const createReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        title: 'Solitude of the Astral Void',
        description: 'A newly calibrated personal universe belonging to the fresh scribe.',
      }),
    });
    const createRes = await createUniverse(createReq);
    assert.strictEqual(createRes.status, 201);

    const createData = await createRes.json();
    createdPersonalUnivId = createData.universe.id;
    assert.strictEqual(createData.universe.user_id, NEW_USER_ID);
    assert.strictEqual(createData.universe.is_example, false);
    assert.strictEqual(createData.universe.title, 'Solitude of the Astral Void');

    // Verify personal listing now reflects exactly 1 personal universe
    const listReq = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const listRes = await getUniverses(listReq);
    const listData = await listRes.json();

    assert.strictEqual(listData.counts.personal, 1);
    assert.strictEqual(listData.personalUniverses.length, 1);
    assert.strictEqual(listData.personalUniverses[0].id, createdPersonalUnivId);
  });

  test('4. Refreshing and restarting do not unexpectedly create duplicate demo universes', async () => {
    // Run seed idempotency check multiple times
    await ensureDefaultUniverses();
    await ensureDefaultUniverses();
    await ensureDefaultUniverses();

    const check = await query<{ id: string; user_id: string; is_example: boolean }>(
      'SELECT id, user_id, is_example FROM universes WHERE id = $1',
      [EXEMPLAR_UNIVERSE_ID]
    );
    assert.strictEqual(check.rows.length, 1, 'Exactly one exemplar demo universe row must exist');
    assert.strictEqual(check.rows[0].user_id, SYSTEM_USER_ID);
    assert.strictEqual(Boolean(check.rows[0].is_example), true);
  });

  test('5. The canonical demo cannot be modified or deleted through UI or API routes', async () => {
    // Attempt to update demo metadata
    const putReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        title: 'Hacked Demo Title',
        description: 'Overwritten description',
      }),
    });
    const putRes = await updateUniverse(putReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(putRes.status, 403, 'PUT on demo universe must return 403 Forbidden');

    // Attempt to delete demo universe
    const delReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}`, {
      method: 'DELETE',
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const delRes = await deleteUniverse(delReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(delRes.status, 403, 'DELETE on demo universe must return 403 Forbidden');

    // Attempt to add a character into the canonical demo
    const charReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        name: 'Intruder Rogue',
        status: 'alive',
      }),
    });
    const charRes = await createCharacter(charReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(charRes.status, 403, 'POST character into demo universe must return 403 Forbidden');

    // Attempt to add a location into the canonical demo
    const locReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        name: 'Unauthorized Domain',
        realm: 'Celestial Firmament',
      }),
    });
    const locRes = await createLocation(locReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(locRes.status, 403, 'POST location into demo universe must return 403 Forbidden');

    // Attempt to add a chapter into the canonical demo
    const chapReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/chapters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        title: 'Illegitimate Chapter',
        sequence_number: 99,
      }),
    });
    const chapRes = await createChapter(chapReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(chapRes.status, 403, 'POST chapter into demo universe must return 403 Forbidden');

    // Attempt to add an event into the canonical demo
    const evReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        title: 'False Convergence',
        timestamp_year: 400,
      }),
    });
    const evRes = await createEvent(evReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(evRes.status, 403, 'POST event into demo universe must return 403 Forbidden');

    // Attempt to add a relationship into the canonical demo
    const relReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/relationships`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        source_character_id: 'char-demo-lyra',
        target_character_id: 'char-demo-vane',
        relationship_type: 'feuding_with',
      }),
    });
    const relRes = await createRelationship(relReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(relRes.status, 403, 'POST relationship into demo universe must return 403 Forbidden');

    // Attempt to add a secret into the canonical demo
    const secReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        title: 'Corrupted Secret',
        content: 'This should not be written to demo.',
        severity: 'major',
      }),
    });
    const secRes = await createSecret(secReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(secRes.status, 403, 'POST secret into demo universe must return 403 Forbidden');
  });

  let clonedUniverseId: string;

  test('6. Duplicating the demo creates an independently editable personal universe', async () => {
    const dupReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}/duplicate`, {
      method: 'POST',
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const dupRes = await duplicateUniverse(dupReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(dupRes.status, 201);

    const dupData = await dupRes.json();
    clonedUniverseId = dupData.universe.id;
    assert.notStrictEqual(clonedUniverseId, EXEMPLAR_UNIVERSE_ID);
    assert.strictEqual(dupData.universe.user_id, NEW_USER_ID, 'Cloned universe must belong to the requesting user');
    assert.strictEqual(dupData.universe.is_example, false, 'Cloned universe must be a personal universe');

    // Verify user can now edit their personal clone
    const putReq = new Request(`http://localhost:3000/api/universes/${clonedUniverseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        title: 'My Custom Aethelgard Variant',
        description: 'An edited branching timeline.',
      }),
    });
    const putRes = await updateUniverse(putReq, { params: Promise.resolve({ id: clonedUniverseId }) });
    assert.strictEqual(putRes.status, 200, 'User should be allowed to edit their personal clone');

    // Verify user can add new characters into their personal clone
    const charReq = new Request(`http://localhost:3000/api/universes/${clonedUniverseId}/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': NEW_USER_TOKEN,
      },
      body: JSON.stringify({
        name: 'Captain Kaelen of the Star-Sailors',
        status: 'alive',
        bio: 'Created in the personal clone.',
      }),
    });
    const charRes = await createCharacter(charReq, { params: Promise.resolve({ id: clonedUniverseId }) });
    assert.strictEqual(charRes.status, 201, 'User should be allowed to add characters to their personal clone');
  });

  test('7. Deleting a personal universe does not affect the canonical demo', async () => {
    // Delete the cloned universe
    const delReq = new Request(`http://localhost:3000/api/universes/${clonedUniverseId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const delRes = await deleteUniverse(delReq, { params: Promise.resolve({ id: clonedUniverseId }) });
    assert.strictEqual(delRes.status, 200);

    // Verify clone is gone
    const getCloneReq = new Request(`http://localhost:3000/api/universes/${clonedUniverseId}`, {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const getCloneRes = await getUniverse(getCloneReq, { params: Promise.resolve({ id: clonedUniverseId }) });
    assert.strictEqual(getCloneRes.status, 404);

    // Verify canonical demo universe is completely intact with all its data
    const demoReq = new Request(`http://localhost:3000/api/universes/${EXEMPLAR_UNIVERSE_ID}`, {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const demoRes = await getUniverse(demoReq, { params: Promise.resolve({ id: EXEMPLAR_UNIVERSE_ID }) });
    assert.strictEqual(demoRes.status, 200);

    const demoData = await demoRes.json();
    assert.strictEqual(demoData.universe.id, EXEMPLAR_UNIVERSE_ID);
    assert.ok(demoData.universe.stats.charactersCount > 0, 'Exemplar demo characters must remain intact');
    assert.ok(demoData.universe.stats.locationsCount > 0, 'Exemplar demo locations must remain intact');
    assert.ok(demoData.universe.stats.eventsCount > 0, 'Exemplar demo events must remain intact');
  });

  test('8. Existing user universe CRUD continues to work seamlessly', async () => {
    // Delete the other test universe created in step 3
    const delReq = new Request(`http://localhost:3000/api/universes/${createdPersonalUnivId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const delRes = await deleteUniverse(delReq, { params: Promise.resolve({ id: createdPersonalUnivId }) });
    assert.strictEqual(delRes.status, 200);

    // Verify user count returns to 0 personal universes
    const listReq = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': NEW_USER_TOKEN },
    });
    const listRes = await getUniverses(listReq);
    const listData = await listRes.json();
    assert.strictEqual(listData.counts.personal, 0);
  });

  test('9. Authentication pipeline: register, login, session inspection, and logout', async () => {
    // 1. Register a new user
    const testEmail = `auth_test_${Date.now()}@worldbuild.sanctum`;
    const regReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        display_name: 'Test Inscribed Scribe',
      }),
    });
    const regRes = await registerUser(regReq);
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    assert.strictEqual(regData.user.email, testEmail);
    assert.ok(regData.session_token);

    // 2. Query /api/auth/me using the returned session token
    const meReq = new Request('http://localhost:3000/api/auth/me', {
      headers: { 'x-session-token': regData.session_token },
    });
    const meRes = await getMe(meReq);
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.id, regData.user.id);
    assert.strictEqual(meData.user.display_name, 'Test Inscribed Scribe');

    // 3. Login with email
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    const loginRes = await loginUser(loginReq);
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.user.id, regData.user.id);

    // 4. Logout clears session
    const logoutRes = await logoutUser();
    assert.strictEqual(logoutRes.status, 200);
  });

  test('10. Quick switch persona loads Novice Chronicler with pristine empty universe state', async () => {
    // Login as Novice Chronicler
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr-novice-chronicler' }),
    });
    const loginRes = await loginUser(loginReq);
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.user.display_name, 'Novice Chronicler');

    // Query universes for Novice Chronicler
    const univReq = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': loginData.session_token },
    });
    const univRes = await getUniverses(univReq);
    const univData = await univRes.json();
    assert.strictEqual(univData.counts.personal, 0, 'Novice Chronicler starts with 0 personal universes');
    assert.strictEqual(univData.personalUniverses.length, 0);
    assert.ok(univData.demoUniverse, 'Canonical demo universe remains discoverable under demo tab');
  });
});
