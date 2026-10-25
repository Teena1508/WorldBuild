import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { POST as createUniverse } from '../src/app/api/universes/route';
import { GET as getChapters, POST as createChapter } from '../src/app/api/universes/[id]/chapters/route';
import {
  GET as getChapter,
  PUT as updateChapter,
  DELETE as deleteChapter,
} from '../src/app/api/universes/[id]/chapters/[chapterId]/route';
import { POST as reorderChapters } from '../src/app/api/universes/[id]/chapters/reorder/route';
import { POST as analyzeChapter } from '../src/app/api/universes/[id]/chapters/[chapterId]/analyze/route';
import { PATCH as updateFinding } from '../src/app/api/universes/[id]/chapters/[chapterId]/findings/[findingId]/route';
import {
  validateLocalRuntimeUrl,
  validateAiFinding,
  validateAiFindingsArray,
  checkOllamaStatus,
} from '../src/lib/ai/ollama';
import { analyzeChapterManuscript } from '../src/lib/ai/chapter-analysis';
import { Chapter, ChapterAnalysisFinding } from '../src/lib/db/types';

describe('Story Studio & Offline Local AI Suite', () => {
  let universeId: string;
  let alienUniverseId: string;
  let testChapterId: string;
  let testChapter2Id: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();

    // Create a primary universe for author testing
    const uReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title: 'Story Studio Test Realm',
        description: 'Continuum for verifying persistent manuscript and local AI oracle',
      }),
    });
    const uRes = await createUniverse(uReq);
    const uData = await uRes.json();
    universeId = uData.universe.id;

    // Create a secondary universe for isolation & security testing
    const alienReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-novice-chronicler' },
      body: JSON.stringify({
        title: 'Alien Parallel World',
        description: 'Foreign realm to test cross-universe boundaries',
      }),
    });
    const alienRes = await createUniverse(alienReq);
    const alienData = await alienRes.json();
    alienUniverseId = alienData.universe.id;

    // Seed canon entities in universeId:
    // Character 1: Deceased (death_year = 350, death_confirmed = true)
    await query(
      `INSERT INTO characters (id, universe_id, name, epithet, bio, birth_year, death_year, death_confirmed, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'deceased')`,
      ['char-dead-malakor', universeId, 'Lord Malakor', 'The Fallen Star', 'Perished in the Astral Cataclysm', 300, 350]
    );

    // Character 2: Alive
    await query(
      `INSERT INTO characters (id, universe_id, name, epithet, bio, birth_year, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'alive')`,
      ['char-alive-elysia', universeId, 'Elysia', 'The Dreamweaver', 'Sole survivor of the glass citadel', 320]
    );

    // Secret: Forbidden Lore
    await query(
      `INSERT INTO secrets (id, universe_id, title, content, severity)
       VALUES ($1, $2, $3, $4, $5)`,
      ['sec-void-cipher', universeId, 'The Void Cipher', 'The celestial formula to unweave time itself', 'forbidden']
    );

    // Character 3 in alien universe
    await query(
      `INSERT INTO characters (id, universe_id, name, bio)
       VALUES ($1, $2, $3, $4)`,
      ['char-alien-zeno', alienUniverseId, 'Zeno of Outer Realms', 'Alien entity']
    );
  });

  after(async () => {
    await closeDatabase();
  });

  // =========================================================================
  // 1. Chapter CRUD and persistence
  // =========================================================================
  test('1. Chapter CRUD: Inscribe, retrieve, update, and delete chapters with manuscript content', async () => {
    // A. Create Chapter 1
    const createReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title: 'Chapter I: The Fractured Compass',
        summary: 'Elysia navigates the obsidian ruins.',
        content: 'Elysia stepped through the silver archway, clutching the shattered compass against the cold wind.',
      }),
    });
    const createRes = await createChapter(createReq, { params: Promise.resolve({ id: universeId }) });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    testChapterId = createData.chapter.id;

    assert.strictEqual(createData.chapter.title, 'Chapter I: The Fractured Compass');
    assert.strictEqual(createData.chapter.sequence_number, 1);
    assert.strictEqual(createData.chapter.version, 1);
    assert.ok(createData.chapter.content.includes('Elysia stepped through'));
    assert.strictEqual(createData.chapter.word_count, 14);

    // B. Create Chapter 2 (auto sequence numbering)
    const create2Req = new Request(`http://localhost:3000/api/universes/${universeId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title: 'Chapter II: Echoes of the Void',
        summary: 'A secret voice speaks in the ruins.',
        content: 'Deep in the crypts, a forgotten whisper broke the silence.',
      }),
    });
    const create2Res = await createChapter(create2Req, { params: Promise.resolve({ id: universeId }) });
    assert.strictEqual(create2Res.status, 201);
    const create2Data = await create2Res.json();
    testChapter2Id = create2Data.chapter.id;
    assert.strictEqual(create2Data.chapter.sequence_number, 2);

    // C. Retrieve Chapter
    const getReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}`, {
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
    });
    const getRes = await getChapter(getReq, { params: Promise.resolve({ id: universeId, chapterId: testChapterId }) });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.chapter.id, testChapterId);
    assert.strictEqual(getData.chapter.content, createData.chapter.content);

    // D. List Chapters
    const listReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters`, {
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
    });
    const listRes = await getChapters(listReq, { params: Promise.resolve({ id: universeId }) });
    const listData = await listRes.json();
    assert.strictEqual(listData.chapters.length, 2);

    // E. Test Chapter Deletion
    const delChapReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({ title: 'Temporary Chapter To Delete', content: 'Temporary text' }),
    });
    const delChapRes = await createChapter(delChapReq, { params: Promise.resolve({ id: universeId }) });
    const delChapData = await delChapRes.json();
    const deleteReq = new Request(
      `http://localhost:3000/api/universes/${universeId}/chapters/${delChapData.chapter.id}`,
      { method: 'DELETE', headers: { 'x-session-token': 'tok-usr-archivist-prime' } }
    );
    const deleteRes = await deleteChapter(deleteReq, {
      params: Promise.resolve({ id: universeId, chapterId: delChapData.chapter.id }),
    });
    assert.strictEqual(deleteRes.status, 200);
  });

  // =========================================================================
  // 2. Chapter Reordering
  // =========================================================================
  test('2. Chapter Reordering: Atomically swaps chapter sequences in database', async () => {
    // Reorder: put Chapter 2 first, Chapter 1 second
    const reorderReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters/reorder`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        chapter_ids: [testChapter2Id, testChapterId],
      }),
    });
    const reorderRes = await reorderChapters(reorderReq, { params: Promise.resolve({ id: universeId }) });
    assert.strictEqual(reorderRes.status, 200);
    const reorderData = await reorderRes.json();

    const c2 = reorderData.chapters.find((c: Chapter) => c.id === testChapter2Id);
    const c1 = reorderData.chapters.find((c: Chapter) => c.id === testChapterId);
    assert.strictEqual(c2.sequence_number, 1);
    assert.strictEqual(c1.sequence_number, 2);

    // Swap back
    await reorderChapters(
      new Request(`http://localhost:3000/api/universes/${universeId}/chapters/reorder`, {
        method: 'POST',
        headers: { 'x-session-token': 'tok-usr-archivist-prime' },
        body: JSON.stringify({ chapter_ids: [testChapterId, testChapter2Id] }),
      }),
      { params: Promise.resolve({ id: universeId }) }
    );
  });

  // =========================================================================
  // 3. Autosave and Concurrent-Edit Protection
  // =========================================================================
  test('3. Autosave & Optimistic Concurrency: Rejects stale edits with HTTP 409 Conflict', async () => {
    // Successful update with expected_version = 1
    const putReq1 = new Request(`http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}`, {
      method: 'PUT',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title: 'Chapter I: The Fractured Compass (Revised)',
        content: 'Elysia stepped through the silver archway. Lord Malakor approached her with drawn blade.',
        expected_version: 1,
      }),
    });
    const putRes1 = await updateChapter(putReq1, { params: Promise.resolve({ id: universeId, chapterId: testChapterId }) });
    assert.strictEqual(putRes1.status, 200);
    const putData1 = await putRes1.json();
    assert.strictEqual(putData1.chapter.version, 2);

    // Stale update: sending expected_version = 1 again must trigger HTTP 409 Conflict
    const putReqConflict = new Request(`http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}`, {
      method: 'PUT',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title: 'Chapter I: Stale overwrite attempt',
        content: 'This edit should be blocked by optimistic concurrency.',
        expected_version: 1,
      }),
    });
    const putResConflict = await updateChapter(putReqConflict, { params: Promise.resolve({ id: universeId, chapterId: testChapterId }) });
    assert.strictEqual(putResConflict.status, 409);
    const conflictData = await putResConflict.json();
    assert.strictEqual(conflictData.code, 'CONCURRENT_EDIT_CONFLICT');
    assert.ok(conflictData.error.includes('Concurrent edit conflict'));
    assert.strictEqual(conflictData.currentChapter.version, 2);
  });

  // =========================================================================
  // 4. Missing Ollama runtime and model resilience
  // =========================================================================
  test('4. Missing Runtime Handling: Gracefully reports offline state and executes deterministic rules', async () => {
    // Point Ollama to an unreachable offline port
    const originalUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:54321';

    const status = await checkOllamaStatus();
    assert.strictEqual(status.isAvailable, false);
    assert.strictEqual(status.errorCode, 'OLLAMA_NOT_RUNNING');
    assert.ok(status.errorMessage?.includes('127.0.0.1:54321'));

    // Even when Ollama is offline, analyzeChapterManuscript must NOT crash.
    // It must execute deterministic rules and detect that Lord Malakor is canonically deceased!
    const result = await analyzeChapterManuscript({
      universeId,
      chapterId: testChapterId,
      userId: 'usr-archivist-prime',
    });

    assert.strictEqual(result.runtimeStatus.isAvailable, false);
    assert.ok(result.findings.length > 0);

    const postMortemFinding = result.findings.find((f) => f.title.includes('Post-Mortem Activity'));
    assert.ok(postMortemFinding, 'Expected post-mortem deterministic finding for Lord Malakor');
    assert.strictEqual(postMortemFinding?.source, 'deterministic_rule');
    assert.strictEqual(postMortemFinding?.severity, 'critical');
    assert.strictEqual(postMortemFinding?.confidence, 1.0);
    assert.ok(postMortemFinding?.passage?.includes('Lord Malakor'));

    // Restore env
    process.env.OLLAMA_BASE_URL = originalUrl || 'http://127.0.0.1:11434';
  });

  // =========================================================================
  // 5. Valid and Invalid Structured AI Responses
  // =========================================================================
  test('5. Structured AI Schema Validation: Sanitizes valid items and rejects malformed fields', () => {
    // Valid item with fuzzy category and severity
    const validRaw = {
      category: 'Character-Knowledge',
      severity: 'High',
      title: 'Premature Secret Leak',
      description: 'Elysia speaks of the Void Cipher without having uncovered it.',
      passage: 'Elysia whispered the secrets of the Void Cipher.',
      conflicting_canon: 'Secret is restricted to High Scribes.',
      explanation: 'Elysia has no clearance.',
      suggested_fix: 'Show how Elysia found the cipher scroll.',
      confidence: 0.92,
    };
    const parsed = validateAiFinding(validRaw);
    assert.ok(parsed);
    assert.strictEqual(parsed.category, 'character_knowledge');
    assert.strictEqual(parsed.severity, 'high');
    assert.strictEqual(parsed.confidence, 0.92);

    // Wrapped object with { findings: [...] }
    const wrappedObj = {
      findings: [validRaw],
    };
    const list = validateAiFindingsArray(wrappedObj);
    assert.strictEqual(list.length, 1);

    // Invalid item missing title or explanation
    const invalidRaw = { category: 'timeline_paradox', title: '' };
    assert.strictEqual(validateAiFinding(invalidRaw), null);

    // Completely empty or non-object
    assert.strictEqual(validateAiFinding(null), null);
    assert.strictEqual(validateAiFinding('random string'), null);
  });

  // =========================================================================
  // 6. Detection Deduplication and Stale Findings
  // =========================================================================
  test('6. Deduplication & Stale Findings: Deduplicates repeats and marks edited chapters as stale', async () => {
    // Run analysis once
    const res1 = await analyzeChapter(
      new Request(`http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}/analyze`, {
        method: 'POST',
        headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      }),
      { params: Promise.resolve({ id: universeId, chapterId: testChapterId }) }
    );
    const data1 = await res1.json();
    const initialFindingsCount = data1.findings.length;
    assert.ok(initialFindingsCount > 0);

    // Re-run immediately: count must NOT double (idempotent deduplication)
    const res2 = await analyzeChapter(
      new Request(`http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}/analyze`, {
        method: 'POST',
        headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      }),
      { params: Promise.resolve({ id: universeId, chapterId: testChapterId }) }
    );
    const data2 = await res2.json();
    assert.strictEqual(data2.findings.length, initialFindingsCount);

    // Update chapter manuscript content: must mark existing findings as is_stale = true
    const currentChap = await query<Chapter>('SELECT version FROM chapters WHERE id = $1', [testChapterId]);
    await updateChapter(
      new Request(`http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}`, {
        method: 'PUT',
        headers: { 'x-session-token': 'tok-usr-archivist-prime' },
        body: JSON.stringify({
          content: 'Elysia stepped through the silver archway into the quiet moonlight.',
          expected_version: currentChap.rows[0].version,
        }),
      }),
      { params: Promise.resolve({ id: universeId, chapterId: testChapterId }) }
    );

    const staleFindings = await query<ChapterAnalysisFinding>(
      'SELECT * FROM chapter_analysis_findings WHERE chapter_id = $1 AND is_stale = true',
      [testChapterId]
    );
    assert.ok(staleFindings.rows.length > 0, 'Expected findings to be marked is_stale after manuscript edit');
  });

  // =========================================================================
  // 7. Intentional Exceptions & Author Dismissal
  // =========================================================================
  test('7. Author Control: Dismiss finding with intentional plot device reason', async () => {
    const findingRow = await query<ChapterAnalysisFinding>(
      'SELECT id FROM chapter_analysis_findings WHERE chapter_id = $1 LIMIT 1',
      [testChapterId]
    );
    assert.ok(findingRow.rows.length > 0);
    const findingId = findingRow.rows[0].id;

    // Author marks as intentional plot device (dismissed)
    const patchReq = new Request(
      `http://localhost:3000/api/universes/${universeId}/chapters/${testChapterId}/findings/${findingId}`,
      {
        method: 'PATCH',
        headers: { 'x-session-token': 'tok-usr-archivist-prime' },
        body: JSON.stringify({
          status: 'dismissed',
          dismissal_reason: 'Unreliable Narrator: Elysia is hallucinating the apparition of Malakor',
          author_notes: 'Confirmed narrative twist for Act II',
        }),
      }
    );
    const patchRes = await updateFinding(patchReq, {
      params: Promise.resolve({ id: universeId, chapterId: testChapterId, findingId }),
    });
    assert.strictEqual(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.strictEqual(patchData.finding.status, 'dismissed');
    assert.strictEqual(
      patchData.finding.dismissal_reason,
      'Unreliable Narrator: Elysia is hallucinating the apparition of Malakor'
    );
  });

  // =========================================================================
  // 8. Access Control & Cross-Universe Integrity
  // =========================================================================
  test('8. Cross-Universe Isolation: Blocks unauthorized access and foreign chapter reordering', async () => {
    // User Novice Chronicler tries to write to Archivist Prime's universe -> 403 Forbidden
    const unauthReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-novice-chronicler' },
      body: JSON.stringify({ title: 'Hacked Chapter', summary: 'Intrusion' }),
    });
    const unauthRes = await createChapter(unauthReq, { params: Promise.resolve({ id: universeId }) });
    assert.strictEqual(unauthRes.status, 403);

    // Foreign chapter ID in reorder -> 400 Bad Request
    const crossReq = new Request(`http://localhost:3000/api/universes/${universeId}/chapters/reorder`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({ chapter_ids: ['chap-foreign-12345'] }),
    });
    const crossRes = await reorderChapters(crossReq, { params: Promise.resolve({ id: universeId }) });
    assert.strictEqual(crossRes.status, 400);
  });

  // =========================================================================
  // 9. Verification that NO Cloud AI Provider is Called
  // =========================================================================
  test('9. Privacy Boundary: Loopback URL validation rejects public or cloud AI endpoints', () => {
    // Valid loopback addresses
    assert.strictEqual(validateLocalRuntimeUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
    assert.strictEqual(validateLocalRuntimeUrl('http://localhost:11434'), 'http://localhost:11434');
    assert.strictEqual(validateLocalRuntimeUrl('http://[::1]:11434'), 'http://[::1]:11434');

    // Cloud AI URLs MUST be rejected with security boundary violation
    assert.throws(
      () => validateLocalRuntimeUrl('https://api.openai.com/v1'),
      /Security boundary violation/
    );
    assert.throws(
      () => validateLocalRuntimeUrl('https://api.anthropic.com'),
      /Security boundary violation/
    );
    assert.throws(
      () => validateLocalRuntimeUrl('https://generativelanguage.googleapis.com'),
      /Security boundary violation/
    );
    assert.throws(
      () => validateLocalRuntimeUrl('http://192.168.1.100:11434'),
      /Security boundary violation/
    );
  });
});
