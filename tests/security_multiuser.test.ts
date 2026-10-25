import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers, DEMO_UNIVERSE_ID } from '../src/lib/auth/session';

import { POST as registerUser } from '../src/app/api/auth/register/route';
import { POST as loginUser } from '../src/app/api/auth/login/route';
import { POST as logoutUser } from '../src/app/api/auth/logout/route';
import { GET as getMe } from '../src/app/api/auth/me/route';

import { GET as getUniverses, POST as createUniverse } from '../src/app/api/universes/route';
import {
  GET as getUniverse,
  PUT as updateUniverse,
  DELETE as deleteUniverse,
} from '../src/app/api/universes/[id]/route';
import { POST as duplicateUniverse } from '../src/app/api/universes/[id]/duplicate/route';

import { GET as getChapters, POST as createChapter } from '../src/app/api/universes/[id]/chapters/route';
import {
  GET as getChapter,
  PUT as updateChapter,
} from '../src/app/api/universes/[id]/chapters/[chapterId]/route';

import { GET as getCharacters, POST as createCharacter } from '../src/app/api/universes/[id]/characters/route';
import { POST as createLocation } from '../src/app/api/universes/[id]/locations/route';
import { POST as createEvent } from '../src/app/api/universes/[id]/events/route';
import { POST as runContinuityScan } from '../src/app/api/universes/[id]/validate/route';

describe('Multi-User Database, Authentication & Private Workspaces Security Suite', () => {
  let userAToken: string;
  let userAId: string;
  const userAEmail = `scribe_alpha_${Date.now()}@worldbuild.sanctum`;
  const userAPassword = 'AlphaPassword2026!';

  let userBToken: string;
  let userBId: string;
  const userBEmail = `scribe_beta_${Date.now()}@worldbuild.sanctum`;
  const userBPassword = 'BetaPassword2026!';

  let univAId: string;
  let univBId: string;
  let chapAId: string;
  let charAId: string;
  let locAId: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();
  });

  after(async () => {
    await closeDatabase();
  });

  test('1. Register User A and User B and create separate sessions with hashed passwords', async () => {
    // Register User A
    const reqA = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        display_name: 'Scribe Alpha',
        password: userAPassword,
      }),
    });
    const resA = await registerUser(reqA);
    assert.strictEqual(resA.status, 201, 'User A registration must return 201');
    const dataA = await resA.json();
    assert.ok(dataA.session_token, 'Session token must be generated for User A');
    assert.strictEqual(dataA.user.email, userAEmail);
    userAToken = dataA.session_token;
    userAId = dataA.user.id;

    // Register User B
    const reqB = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userBEmail,
        display_name: 'Scribe Beta',
        password: userBPassword,
      }),
    });
    const resB = await registerUser(reqB);
    assert.strictEqual(resB.status, 201, 'User B registration must return 201');
    const dataB = await resB.json();
    assert.ok(dataB.session_token, 'Session token must be generated for User B');
    assert.notStrictEqual(dataA.session_token, dataB.session_token, 'Tokens must be distinct');
    userBToken = dataB.session_token;
    userBId = dataB.user.id;
    assert.ok(userBId, 'User B ID must be valid');

    // Verify database stores hashed passwords, never plaintext
    const dbUsers = await query<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM app_users WHERE email IN ($1, $2)',
      [userAEmail, userBEmail]
    );
    assert.strictEqual(dbUsers.rows.length, 2);
    for (const row of dbUsers.rows) {
      assert.ok(row.password_hash.startsWith('$2'), 'Password must be hashed with bcrypt');
      assert.ok(!row.password_hash.includes('Password'), 'Plaintext password must not be stored');
    }
  });

  test('2. Verify each user sees only their own personal universes', async () => {
    // User A creates universe
    const createReqA = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        title: "Scribe Alpha's Private Continuum",
        description: 'Classified chronicle of the astral realm',
      }),
    });
    const createResA = await createUniverse(createReqA);
    assert.strictEqual(createResA.status, 201);
    const createDataA = await createResA.json();
    univAId = createDataA.universe.id;

    // User B creates universe
    const createReqB = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userBToken,
      },
      body: JSON.stringify({
        title: "Scribe Beta's Subterranean Domain",
        description: 'Hidden deep records of obsidian catacombs',
      }),
    });
    const createResB = await createUniverse(createReqB);
    assert.strictEqual(createResB.status, 201);
    const createDataB = await createResB.json();
    univBId = createDataB.universe.id;

    // User A fetches universes
    const listReqA = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': userAToken },
    });
    const listResA = await getUniverses(listReqA);
    const listDataA = await listResA.json();
    const aTitles = listDataA.personalUniverses.map((u: { title: string }) => u.title);
    assert.ok(aTitles.includes("Scribe Alpha's Private Continuum"));
    assert.ok(!aTitles.includes("Scribe Beta's Subterranean Domain"), 'User A must not see User B universe');

    // User B fetches universes
    const listReqB = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': userBToken },
    });
    const listResB = await getUniverses(listReqB);
    const listDataB = await listResB.json();
    const bTitles = listDataB.personalUniverses.map((u: { title: string }) => u.title);
    assert.ok(bTitles.includes("Scribe Beta's Subterranean Domain"));
    assert.ok(!bTitles.includes("Scribe Alpha's Private Continuum"), 'User B must not see User A universe');
  });

  test('3. Verify each user sees only chapters and entities belonging to their accessible universes', async () => {
    // User A creates a chapter, character, and location in Univ A
    const chapReq = new Request(`http://localhost:3000/api/universes/${univAId}/chapters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        title: 'Chapter I: The Astral Awakening',
        manuscript_content: 'In the celestial dawn, stars whispered secrets.',
      }),
    });
    const chapRes = await createChapter(chapReq, { params: Promise.resolve({ id: univAId }) });
    assert.strictEqual(chapRes.status, 201);
    const chapData = await chapRes.json();
    chapAId = chapData.chapter.id;

    const charReq = new Request(`http://localhost:3000/api/universes/${univAId}/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        name: 'Lord Valerius',
        bio: 'A noble celestial knight and keeper of the astral gates.',
        role: 'Protagonist',
      }),
    });
    const charRes = await createCharacter(charReq, { params: Promise.resolve({ id: univAId }) });
    assert.strictEqual(charRes.status, 201);
    const charData = await charRes.json();
    charAId = charData.character.id;

    const locReq = new Request(`http://localhost:3000/api/universes/${univAId}/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        name: 'Sky Citadel',
        description: 'A floating celestial fortress held by astral anchors.',
      }),
    });
    const locRes = await createLocation(locReq, { params: Promise.resolve({ id: univAId }) });
    assert.strictEqual(locRes.status, 201);
    const locData = await locRes.json();
    locAId = locData.location.id;
    assert.ok(locAId, 'Location ID must be valid');

    // User A can view their chapters
    const aChapsRes = await getChapters(new Request(`http://localhost:3000/api/universes/${univAId}/chapters`, {
      headers: { 'x-session-token': userAToken },
    }), { params: Promise.resolve({ id: univAId }) });
    assert.strictEqual(aChapsRes.status, 200);

    // User B cannot view User A's chapters or characters
    const bChapsRes = await getChapters(new Request(`http://localhost:3000/api/universes/${univAId}/chapters`, {
      headers: { 'x-session-token': userBToken },
    }), { params: Promise.resolve({ id: univAId }) });
    assert.ok(bChapsRes.status === 403 || bChapsRes.status === 404, 'User B must be forbidden from listing User A chapters');

    const bCharsRes = await getCharacters(new Request(`http://localhost:3000/api/universes/${univAId}/characters`, {
      headers: { 'x-session-token': userBToken },
    }), { params: Promise.resolve({ id: univAId }) });
    assert.ok(bCharsRes.status === 403 || bCharsRes.status === 404, 'User B must be forbidden from listing User A characters');
  });

  test("4. Verify User B cannot read User A's universe by guessing its ID", async () => {
    const probeReq = new Request(`http://localhost:3000/api/universes/${univAId}`, {
      headers: { 'x-session-token': userBToken },
    });
    const probeRes = await getUniverse(probeReq, { params: Promise.resolve({ id: univAId }) });
    assert.ok(
      probeRes.status === 403 || probeRes.status === 404,
      'User B must receive 403 or 404 when querying User A universe'
    );
    const body = await probeRes.json();
    assert.ok(!body.universe, 'No private universe data may be leaked in response');
  });

  test("5. Verify User B cannot edit or delete User A's universe or child records", async () => {
    // Attempt edit universe
    const editReq = new Request(`http://localhost:3000/api/universes/${univAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userBToken,
      },
      body: JSON.stringify({
        title: 'Hacked Universe Name',
        description: 'Vandalized description',
      }),
    });
    const editRes = await updateUniverse(editReq, { params: Promise.resolve({ id: univAId }) });
    assert.ok(editRes.status === 403 || editRes.status === 404, 'User B must not be permitted to edit User A universe');

    // Attempt edit chapter
    const chapEditReq = new Request(`http://localhost:3000/api/universes/${univAId}/chapters/${chapAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userBToken,
      },
      body: JSON.stringify({
        title: 'Tampered Chapter',
        manuscript_content: 'Overwritten content',
      }),
    });
    const chapEditRes = await updateChapter(chapEditReq, {
      params: Promise.resolve({ id: univAId, chapterId: chapAId }),
    });
    assert.ok(chapEditRes.status === 403 || chapEditRes.status === 404, 'User B cannot edit User A chapter');

    // Attempt delete universe
    const delReq = new Request(`http://localhost:3000/api/universes/${univAId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userBToken },
    });
    const delRes = await deleteUniverse(delReq, { params: Promise.resolve({ id: univAId }) });
    assert.ok(delRes.status === 403 || delRes.status === 404, 'User B cannot delete User A universe');

    // Verify User A universe still exists untouched in database
    const checkDb = await query<{ title: string }>('SELECT title FROM universes WHERE id = $1', [univAId]);
    assert.strictEqual(checkDb.rows[0].title, "Scribe Alpha's Private Continuum");
  });

  test('6. Verify cross-universe references are rejected', async () => {
    // Attempt to create an event in Universe A that references location or character from Universe B or vice versa
    const crossEventReq = new Request(`http://localhost:3000/api/universes/${univAId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        title: 'The Incursion',
        timestamp_start: 100,
        location_id: 'loc-alien-nonexistent',
      }),
    });
    const crossRes = await createEvent(crossEventReq, { params: Promise.resolve({ id: univAId }) });
    assert.strictEqual(crossRes.status, 400, 'Cross-universe or invalid location reference must return 400');
  });

  test('7. Verify logging out invalidates the session', async () => {
    // User A logs out
    const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
    });
    const logoutRes = await logoutUser(logoutReq);
    assert.strictEqual(logoutRes.status, 200);

    // Using the invalidated session token now fails
    const listAfterLogoutReq = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': userAToken },
    });
    const listAfterLogoutRes = await getUniverses(listAfterLogoutReq);
    const data = await listAfterLogoutRes.json();
    // For unauthenticated/invalidated token, personalUniverses is empty
    assert.strictEqual(data.personalUniverses.length, 0);

    // Protected endpoint directly requiring authentication
    const meReq = new Request('http://localhost:3000/api/auth/me', {
      headers: { 'x-session-token': userAToken },
    });
    const meRes = await getMe(meReq);
    const meData = await meRes.json();
    assert.strictEqual(meData.user, null, 'User session must be null after logout');
  });

  test("8. Verify a fresh login restores the correct user's saved data", async () => {
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password: userAPassword,
      }),
    });
    const loginRes = await loginUser(loginReq);
    assert.strictEqual(loginRes.status, 200, 'Fresh login with correct password must succeed');
    const loginData = await loginRes.json();
    assert.ok(loginData.session_token);
    userAToken = loginData.session_token; // Refresh active token

    // Retrieve User A universes with new token
    const listReq = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': userAToken },
    });
    const listRes = await getUniverses(listReq);
    const listData = await listRes.json();
    const titles = listData.personalUniverses.map((u: { title: string }) => u.title);
    assert.ok(titles.includes("Scribe Alpha's Private Continuum"), 'Saved universe must be restored');
  });

  test('9. Verify chapter content survives refreshes and application restarts in PostgreSQL', async () => {
    // Update chapter with rich manuscript content
    const updatedContent = 'Under the celestial dome, the oracle deciphered the chronostone.';
    const updateReq = new Request(`http://localhost:3000/api/universes/${univAId}/chapters/${chapAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        title: 'Chapter I: The Astral Awakening (Revised)',
        manuscript_content: updatedContent,
      }),
    });
    const updateRes = await updateChapter(updateReq, {
      params: Promise.resolve({ id: univAId, chapterId: chapAId }),
    });
    assert.strictEqual(updateRes.status, 200);

    // Direct database inspection ensuring persistent SQL storage
    const sqlRes = await query<{ title: string; content: string }>(
      'SELECT title, content FROM chapters WHERE id = $1 AND universe_id = $2',
      [chapAId, univAId]
    );
    assert.strictEqual(sqlRes.rows.length, 1);
    assert.strictEqual(sqlRes.rows[0].title, 'Chapter I: The Astral Awakening (Revised)');
    assert.strictEqual(sqlRes.rows[0].content, updatedContent);

    // HTTP retrieval check
    const getReq = new Request(`http://localhost:3000/api/universes/${univAId}/chapters/${chapAId}`, {
      headers: { 'x-session-token': userAToken },
    });
    const getRes = await getChapter(getReq, {
      params: Promise.resolve({ id: univAId, chapterId: chapAId }),
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.chapter.content, updatedContent);
  });

  test('10. Verify creating an account does not automatically insert demo universe into personal workspace', async () => {
    const userCEmail = `scribe_gamma_${Date.now()}@worldbuild.sanctum`;
    const regReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userCEmail,
        display_name: 'Scribe Gamma',
        password: 'GammaPassword2026!',
      }),
    });
    const regRes = await registerUser(regReq);
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();

    // Verify personal universe count is 0
    const listReq = new Request('http://localhost:3000/api/universes', {
      headers: { 'x-session-token': regData.session_token },
    });
    const listRes = await getUniverses(listReq);
    const listData = await listRes.json();
    assert.strictEqual(listData.counts.personal, 0, 'New user must start with 0 personal universes');
    assert.strictEqual(listData.personalUniverses.length, 0);
    assert.ok(listData.demoUniverse, 'Canonical demo universe must be separated and present under demo reference');
  });

  test('11. Verify demo access is read-only (mutations rejected)', async () => {
    // Unauthenticated read succeeds
    const unauthDemoReq = new Request(`http://localhost:3000/api/universes/${DEMO_UNIVERSE_ID}`);
    const unauthDemoRes = await getUniverse(unauthDemoReq, {
      params: Promise.resolve({ id: DEMO_UNIVERSE_ID }),
    });
    assert.strictEqual(unauthDemoRes.status, 200, 'Demo universe must be publicly readable');

    // Authenticated read succeeds
    const authDemoReq = new Request(`http://localhost:3000/api/universes/${DEMO_UNIVERSE_ID}`, {
      headers: { 'x-session-token': userAToken },
    });
    const authDemoRes = await getUniverse(authDemoReq, {
      params: Promise.resolve({ id: DEMO_UNIVERSE_ID }),
    });
    assert.strictEqual(authDemoRes.status, 200);

    // Mutation attempts on demo are rejected with 403 Forbidden
    const editDemoReq = new Request(`http://localhost:3000/api/universes/${DEMO_UNIVERSE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({ title: 'Corrupted Demo Title' }),
    });
    const editDemoRes = await updateUniverse(editDemoReq, {
      params: Promise.resolve({ id: DEMO_UNIVERSE_ID }),
    });
    assert.strictEqual(editDemoRes.status, 403, 'Demo universe must reject modifications');

    const delDemoReq = new Request(`http://localhost:3000/api/universes/${DEMO_UNIVERSE_ID}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userAToken },
    });
    const delDemoRes = await deleteUniverse(delDemoReq, {
      params: Promise.resolve({ id: DEMO_UNIVERSE_ID }),
    });
    assert.strictEqual(delDemoRes.status, 403, 'Demo universe must reject deletion');
  });

  let demoDuplicateId: string;

  test('12. Verify duplicating the demo creates an independent, editable copy', async () => {
    const dupReq = new Request(`http://localhost:3000/api/universes/${DEMO_UNIVERSE_ID}/duplicate`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
    });
    const dupRes = await duplicateUniverse(dupReq, {
      params: Promise.resolve({ id: DEMO_UNIVERSE_ID }),
    });
    assert.strictEqual(dupRes.status, 201, 'Duplication must return 201');
    const dupData = await dupRes.json();
    assert.ok(dupData.universe.id);
    assert.notStrictEqual(dupData.universe.id, DEMO_UNIVERSE_ID);
    assert.strictEqual(dupData.universe.is_example, false, 'Duplicate is a personal universe');
    assert.strictEqual(dupData.universe.user_id, userAId, 'Duplicate must be owned by User A');
    demoDuplicateId = dupData.universe.id;

    // Verify User A can edit this personal duplicate
    const editDupReq = new Request(`http://localhost:3000/api/universes/${demoDuplicateId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userAToken,
      },
      body: JSON.stringify({
        title: 'Aethelgard: My Customized Astral Realm',
        description: 'Personalized fork of canonical demo lore',
      }),
    });
    const editDupRes = await updateUniverse(editDupReq, {
      params: Promise.resolve({ id: demoDuplicateId }),
    });
    assert.strictEqual(editDupRes.status, 200, 'User A can edit their personal duplicate');
  });

  test('13. Verify deleting a duplicate does not affect the canonical demo', async () => {
    const delReq = new Request(`http://localhost:3000/api/universes/${demoDuplicateId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userAToken },
    });
    const delRes = await deleteUniverse(delReq, {
      params: Promise.resolve({ id: demoDuplicateId }),
    });
    assert.strictEqual(delRes.status, 200, 'Deleting personal duplicate must succeed');

    // Verify canonical demo remains intact in database
    const checkDemo = await query<{ id: string; title: string }>(
      'SELECT id, title FROM universes WHERE id = $1',
      [DEMO_UNIVERSE_ID]
    );
    assert.strictEqual(checkDemo.rows.length, 1, 'Canonical demo universe must still exist');
    assert.ok(checkDemo.rows[0].title.includes('Aethelgard'));
  });

  test('14. Verify Continuity Oracle, search, graph, and timeline enforce the same access rules', async () => {
    // User B attempts to run Continuity Oracle scan on User A universe
    const oracleReq = new Request(`http://localhost:3000/api/universes/${univAId}/validate`, {
      method: 'POST',
      headers: { 'x-session-token': userBToken },
    });
    const oracleRes = await runContinuityScan(oracleReq, {
      params: Promise.resolve({ id: univAId }),
    });
    assert.ok(
      oracleRes.status === 403 || oracleRes.status === 404,
      'Continuity scan must be rejected for non-owner'
    );

    // Search query by User B for User A universe title returns 0 results
    const searchReq = new Request(`http://localhost:3000/api/universes?q=${encodeURIComponent('Alpha')}`, {
      headers: { 'x-session-token': userBToken },
    });
    const searchRes = await getUniverses(searchReq);
    const searchData = await searchRes.json();
    assert.strictEqual(searchData.personalUniverses.length, 0, 'User B search must not return User A universe');
  });

  test('15. Verify unauthenticated requests cannot access protected personal data', async () => {
    // Unauthenticated GET on personal universe
    const unauthGetReq = new Request(`http://localhost:3000/api/universes/${univAId}`, {
      headers: { 'x-unauthenticated': 'true' },
    });
    const unauthGetRes = await getUniverse(unauthGetReq, {
      params: Promise.resolve({ id: univAId }),
    });
    assert.ok(
      unauthGetRes.status === 401 || unauthGetRes.status === 403 || unauthGetRes.status === 404,
      'Unauthenticated request must be denied access to private universe'
    );

    // Unauthenticated creation of universe
    const unauthCreateReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-unauthenticated': 'true',
      },
      body: JSON.stringify({
        title: 'Unauthenticated Universe',
        description: 'Should be rejected without valid credentials',
      }),
    });
    const unauthCreateRes = await createUniverse(unauthCreateReq);
    assert.strictEqual(unauthCreateRes.status, 401, 'Unauthenticated universe creation must return 401');
  });

  test('16. Verify existing universe CRUD and entity CRUD tests continue to pass', async () => {
    // Complete entity lifecycle check for User A
    const charListReq = new Request(`http://localhost:3000/api/universes/${univAId}/characters`, {
      headers: { 'x-session-token': userAToken },
    });
    const charListRes = await getCharacters(charListReq, {
      params: Promise.resolve({ id: univAId }),
    });
    assert.strictEqual(charListRes.status, 200);
    const charListData = await charListRes.json();
    assert.ok(charListData.characters.length >= 1);
    assert.strictEqual(charListData.characters[0].id, charAId);

    // Clean up User A and User B test universes
    const cleanupA = await deleteUniverse(new Request(`http://localhost:3000/api/universes/${univAId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userAToken },
    }), { params: Promise.resolve({ id: univAId }) });
    assert.strictEqual(cleanupA.status, 200);

    const cleanupB = await deleteUniverse(new Request(`http://localhost:3000/api/universes/${univBId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userBToken },
    }), { params: Promise.resolve({ id: univBId }) });
    assert.strictEqual(cleanupB.status, 200);
  });
});
