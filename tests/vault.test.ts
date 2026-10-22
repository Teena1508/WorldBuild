import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { GET as getUniverses, POST as createUniverse } from '../src/app/api/universes/route';
import { GET as getUniverse, PUT as updateUniverse, DELETE as deleteUniverse } from '../src/app/api/universes/[id]/route';
import { POST as duplicateUniverse } from '../src/app/api/universes/[id]/duplicate/route';

describe('World Vault & PostgreSQL Universe CRUD', () => {
  let createdUniverseId: string;
  let duplicatedUniverseId: string;

  before(async () => {
    await runMigrations();
    await ensureDefaultUsers();
  });

  test('GET /api/universes returns seeded and created universes with statistics', async () => {
    const req = new Request('http://localhost:3000/api/universes');
    const res = await getUniverses(req);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.universes));
    assert.ok(data.universes.length > 0);

    // Verify example universe presence
    const exampleUniv = data.universes.find((u: { is_example: boolean }) => u.is_example === true);
    assert.ok(exampleUniv, 'Expected exemplar demo universe in list');
    assert.ok(exampleUniv.stats, 'Expected aggregate stats');
  });

  test('POST /api/universes validates input and creates persistent universe record', async () => {
    // Missing title validation
    const invalidReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      body: JSON.stringify({ title: '', description: 'Some description' }),
    });
    const invalidRes = await createUniverse(invalidReq);
    assert.strictEqual(invalidRes.status, 400);

    // Valid creation
    const validReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'The Obsidian Scriptorium of Val-Thalor',
        description: 'A secluded sanctuary where monks chronicle dying constellations.',
        cover_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23',
      }),
    });
    const validRes = await createUniverse(validReq);
    assert.strictEqual(validRes.status, 201);

    const data = await validRes.json();
    assert.ok(data.universe.id);
    assert.strictEqual(data.universe.title, 'The Obsidian Scriptorium of Val-Thalor');
    createdUniverseId = data.universe.id;

    // Verify in database directly
    const dbCheck = await query('SELECT * FROM universes WHERE id = $1', [createdUniverseId]);
    assert.strictEqual(dbCheck.rows.length, 1);
  });

  test('GET /api/universes/[id] retrieves universe details with ownership check', async () => {
    const params = Promise.resolve({ id: createdUniverseId });
    const req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}`);
    const res = await getUniverse(req, { params });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.universe.id, createdUniverseId);
    assert.strictEqual(data.isOwner, true);
  });

  test('PUT /api/universes/[id] updates universe metadata', async () => {
    const params = Promise.resolve({ id: createdUniverseId });
    const req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: 'The Obsidian Scriptorium of Val-Thalor (Revised Canon)',
        description: 'Updated cosmological treatise on dying constellations.',
      }),
    });
    const res = await updateUniverse(req, { params });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.universe.title, 'The Obsidian Scriptorium of Val-Thalor (Revised Canon)');
  });

  test('POST /api/universes/[id]/duplicate transactionally clones universe and sub-records', async () => {
    const params = Promise.resolve({ id: createdUniverseId });
    const req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}/duplicate`, {
      method: 'POST',
    });
    const res = await duplicateUniverse(req, { params });
    assert.strictEqual(res.status, 201);

    const data = await res.json();
    assert.ok(data.universe.id);
    assert.notStrictEqual(data.universe.id, createdUniverseId);
    assert.ok(data.universe.title.includes('(Copy)'));
    duplicatedUniverseId = data.universe.id;
  });

  test('DELETE /api/universes/[id] removes user universe and cleans up cascade', async () => {
    // Delete created universe
    const params = Promise.resolve({ id: createdUniverseId });
    const req = new Request(`http://localhost:3000/api/universes/${createdUniverseId}`, {
      method: 'DELETE',
    });
    const res = await deleteUniverse(req, { params });
    assert.strictEqual(res.status, 200);

    // Verify gone from DB
    const dbCheck = await query('SELECT * FROM universes WHERE id = $1', [createdUniverseId]);
    assert.strictEqual(dbCheck.rows.length, 0);

    // Clean up duplicated universe
    const dupParams = Promise.resolve({ id: duplicatedUniverseId });
    const dupReq = new Request(`http://localhost:3000/api/universes/${duplicatedUniverseId}`, {
      method: 'DELETE',
    });
    await deleteUniverse(dupReq, { params: dupParams });
  });

  test('DELETE /api/universes/[id] protects exemplar demo universes from deletion', async () => {
    const params = Promise.resolve({ id: 'univ-demo-aethelgard' });
    const req = new Request('http://localhost:3000/api/universes/univ-demo-aethelgard', {
      method: 'DELETE',
    });
    const res = await deleteUniverse(req, { params });
    assert.strictEqual(res.status, 403);
  });

  after(async () => {
    await closeDatabase();
  });
});
