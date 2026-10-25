import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import zlib from 'zlib';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { ensureDefaultUniverses } from '../src/lib/db/seed';
import { POST as createStory, GET as getStories } from '../src/app/api/stories/route';
import {
  GET as getStory,
  PUT as updateStory,
  DELETE as deleteStory,
} from '../src/app/api/stories/[id]/route';
import {
  GET as getStoryChapters,
  POST as createStoryChapter,
} from '../src/app/api/stories/[id]/chapters/route';
import {
  GET as getStoryChapter,
  PUT as updateStoryChapter,
  DELETE as deleteStoryChapter,
} from '../src/app/api/stories/[id]/chapters/[chapterId]/route';
import { POST as reorderStoryChapters } from '../src/app/api/stories/[id]/chapters/reorder/route';
import { POST as analyzeStoryChapter } from '../src/app/api/stories/[id]/chapters/[chapterId]/analyze/route';
import { GET as getStoryFindings } from '../src/app/api/stories/[id]/chapters/[chapterId]/findings/route';
import { PATCH as updateStoryFinding } from '../src/app/api/stories/[id]/chapters/[chapterId]/findings/[findingId]/route';
import { POST as createSeries, GET as getSeriesList } from '../src/app/api/series/route';
import { POST as previewManuscript } from '../src/app/api/manuscript/preview/route';
import { POST as importManuscript } from '../src/app/api/manuscript/import/route';
import {
  detectSupportedFileType,
  splitManuscriptIntoChapters,
  calculateWordCount,
  computeContentHash,
} from '../src/lib/manuscript/importer';

/**
 * Creates a minimal valid DOCX zip buffer in memory for testing OpenXML parsing.
 */
function createMockDocxBuffer(xmlTextContent: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1: The Silver Citadel</w:t></w:r></w:p>
    <w:p><w:r><w:t>${xmlTextContent}</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 2: The Starlight Gate</w:t></w:r></w:p>
    <w:p><w:r><w:t>Beyond the second portal, the void sang with crystalline quietude.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const xmlBuffer = Buffer.from(documentXml, 'utf8');
  const filename = 'word/document.xml';
  const filenameBuf = Buffer.from(filename, 'utf8');

  // Deflate compressed stream
  const compressed = zlib.deflateRawSync(xmlBuffer);

  // Local file header (30 bytes + filename length)
  const lfh = Buffer.alloc(30 + filenameBuf.length);
  lfh.writeUInt32LE(0x04034b50, 0); // Signature
  lfh.writeUInt16LE(20, 4); // Version needed
  lfh.writeUInt16LE(0, 6); // Flags
  lfh.writeUInt16LE(8, 8); // Compression: Deflate
  lfh.writeUInt16LE(0, 10); // Mod time
  lfh.writeUInt16LE(0, 12); // Mod date
  lfh.writeUInt32LE(0x12345678, 14); // CRC32 placeholder
  lfh.writeUInt32LE(compressed.length, 18); // Compressed size
  lfh.writeUInt32LE(xmlBuffer.length, 22); // Uncompressed size
  lfh.writeUInt16LE(filenameBuf.length, 26); // Filename len
  lfh.writeUInt16LE(0, 28); // Extra len
  filenameBuf.copy(lfh, 30);

  // Central directory header (46 bytes + filename length)
  const cdh = Buffer.alloc(46 + filenameBuf.length);
  cdh.writeUInt32LE(0x02014b50, 0); // Signature
  cdh.writeUInt16LE(20, 4); // Made by
  cdh.writeUInt16LE(20, 6); // Needed
  cdh.writeUInt16LE(0, 8); // Flags
  cdh.writeUInt16LE(8, 10); // Deflate
  cdh.writeUInt16LE(0, 12);
  cdh.writeUInt16LE(0, 14);
  cdh.writeUInt32LE(0x12345678, 16);
  cdh.writeUInt32LE(compressed.length, 20);
  cdh.writeUInt32LE(xmlBuffer.length, 24);
  cdh.writeUInt16LE(filenameBuf.length, 28);
  cdh.writeUInt16LE(0, 30);
  cdh.writeUInt16LE(0, 32);
  cdh.writeUInt16LE(0, 34);
  cdh.writeUInt16LE(0, 36);
  cdh.writeUInt32LE(0, 38);
  cdh.writeUInt32LE(0, 42); // Relative offset of LFH
  filenameBuf.copy(cdh, 46);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // Total entries on disk
  eocd.writeUInt16LE(1, 10); // Total entries
  eocd.writeUInt32LE(cdh.length, 12); // Size of central dir
  eocd.writeUInt32LE(lfh.length + compressed.length, 16); // Offset of central dir
  eocd.writeUInt16LE(0, 20); // Comment len

  return Buffer.concat([lfh, compressed, cdh, eocd]);
}

describe('Private Story Studio & Manuscript Import Test Suite', () => {
  const userA_token = 'tok-usr-archivist-prime';
  const userB_token = 'tok-usr-novice-chronicler';

  let testStoryId: string;
  let standaloneStoryId: string;
  let testSeriesId: string;
  let testChapterId: string;
  let secondChapterId: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();
    await ensureDefaultUniverses();
  });

  after(async () => {
    await closeDatabase();
  });

  // =========================================================================
  // 1. Series Organization
  // =========================================================================
  test('1. Series CRUD: Organize multi-book sagas per author', async () => {
    const createReq = new Request('http://localhost:3000/api/series', {
      method: 'POST',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        title: 'The Obsidian Chronicles',
        description: 'A trilogy chronicling the shattering of the Astrolabe',
      }),
    });

    const res = await createSeries(createReq);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.series?.id);
    assert.strictEqual(data.series.title, 'The Obsidian Chronicles');
    testSeriesId = data.series.id;

    // List series
    const listReq = new Request('http://localhost:3000/api/series', {
      headers: { 'x-session-token': userA_token },
    });
    const listRes = await getSeriesList(listReq);
    const listData = await listRes.json();
    assert.ok(listData.series.some((s: { id: string }) => s.id === testSeriesId));
  });

  // =========================================================================
  // 2. Story Creation & Persistence
  // =========================================================================
  test('2. Story CRUD: Inscribe standalone and universe-linked stories', async () => {
    // A. Create a universe-linked story in series
    const req1 = new Request('http://localhost:3000/api/stories', {
      method: 'POST',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        title: 'Book I: The Needle of Astris',
        description: 'First volume of the Obsidian Chronicles',
        series_id: testSeriesId,
        series_order: 1,
        author_notes: 'Private author note: ensure Vaelen does not reveal the cipher before Chapter 4.',
        universe_ids: ['univ-demo-aethelgard'],
      }),
    });

    const res1 = await createStory(req1);
    assert.strictEqual(res1.status, 201);
    const data1 = await res1.json();
    assert.ok(data1.story?.id);
    assert.strictEqual(data1.story.title, 'Book I: The Needle of Astris');
    testStoryId = data1.story.id;

    // B. Create a standalone story (no universe)
    const req2 = new Request('http://localhost:3000/api/stories', {
      method: 'POST',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        title: 'The Clockwork Alchemist',
        description: 'Standalone steampunk fantasy novella',
      }),
    });

    const res2 = await createStory(req2);
    assert.strictEqual(res2.status, 201);
    const data2 = await res2.json();
    standaloneStoryId = data2.story.id;

    // C. Retrieve story and verify linked universes & series
    const getReq = new Request(`http://localhost:3000/api/stories/${testStoryId}`, {
      headers: { 'x-session-token': userA_token },
    });
    const getRes = await getStory(getReq, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.story.series_title, 'The Obsidian Chronicles');
    assert.strictEqual(getData.story.linked_universes?.length, 1);
    assert.strictEqual(getData.story.linked_universes[0].id, 'univ-demo-aethelgard');

    // D. Update story
    const putReq = new Request(`http://localhost:3000/api/stories/${testStoryId}`, {
      method: 'PUT',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        title: 'Book I: The Needle of Astris (Revised)',
        author_notes: 'Updated author notes with foreshadowing outline.',
      }),
    });
    const putRes = await updateStory(putReq, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(putRes.status, 200);
    const putData = await putRes.json();
    assert.strictEqual(putData.story.title, 'Book I: The Needle of Astris (Revised)');
  });

  // =========================================================================
  // 3. Ownership Isolation & Security
  // =========================================================================
  test('3. Ownership Isolation: Protect private stories and drafts from cross-user access', async () => {
    // User B attempts to read User A's private story
    const readReq = new Request(`http://localhost:3000/api/stories/${testStoryId}`, {
      headers: { 'x-session-token': userB_token },
    });
    const readRes = await getStory(readReq, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(readRes.status, 403);

    // User B attempts to edit User A's story
    const editReq = new Request(`http://localhost:3000/api/stories/${testStoryId}`, {
      method: 'PUT',
      headers: { 'x-session-token': userB_token },
      body: JSON.stringify({ title: 'Hacked Title' }),
    });
    const editRes = await updateStory(editReq, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(editRes.status, 403);

    // User B attempts to delete User A's story
    const delReq = new Request(`http://localhost:3000/api/stories/${testStoryId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userB_token },
    });
    const delRes = await deleteStory(delReq, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(delRes.status, 403);

    // Deleting canonical demo story is rejected
    const demoDelReq = new Request('http://localhost:3000/api/stories/story-demo-aethelgard', {
      method: 'DELETE',
      headers: { 'x-session-token': userA_token },
    });
    const demoDelRes = await deleteStory(demoDelReq, {
      params: Promise.resolve({ id: 'story-demo-aethelgard' }),
    });
    assert.strictEqual(demoDelRes.status, 403);

    // Unauthenticated request is rejected
    const unauthReq = new Request(`http://localhost:3000/api/stories/${testStoryId}`, {
      headers: { 'x-unauthenticated': 'true' },
    });
    const unauthRes = await getStory(unauthReq, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(unauthRes.status, 401);
  });

  // =========================================================================
  // 4. Chapter CRUD & Autosave Concurrency Control
  // =========================================================================
  test('4. Chapter CRUD & Optimistic Concurrency in Story Studio', async () => {
    // A. Create Chapter 1
    const cReq1 = new Request(`http://localhost:3000/api/stories/${testStoryId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        title: 'Chapter 1: Whispers in the Obsidian Scriptorium',
        summary: 'Vaelen observes the trembling needle of Astris.',
        content: 'The obsidian needle hummed with cold dissonance across the silent scriptorium vault.',
        author_notes: 'Foreshadowing: mention the silver prism early.',
      }),
    });

    const cRes1 = await createStoryChapter(cReq1, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(cRes1.status, 201);
    const cData1 = await cRes1.json();
    assert.ok(cData1.chapter?.id);
    assert.strictEqual(cData1.chapter.sequence_number, 1);
    assert.strictEqual(cData1.chapter.version, 1);
    assert.strictEqual(cData1.chapter.word_count, 12);
    testChapterId = cData1.chapter.id;

    // B. Create Chapter 2 (auto-increments sequence)
    const cReq2 = new Request(`http://localhost:3000/api/stories/${testStoryId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        title: 'Chapter 2: The Shattered Seawall',
        content: 'Salt and broken seafoam lashed against the lower piers.',
      }),
    });

    const cRes2 = await createStoryChapter(cReq2, { params: Promise.resolve({ id: testStoryId }) });
    assert.strictEqual(cRes2.status, 201);
    const cData2 = await cRes2.json();
    assert.strictEqual(cData2.chapter.sequence_number, 2);
    secondChapterId = cData2.chapter.id;

    // C. Concurrency Conflict Detection (Autosave protection)
    // Attempting to update with stale expected_version (e.g. expected 99 vs actual 1)
    const conflictReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${testChapterId}`,
      {
        method: 'PUT',
        headers: { 'x-session-token': userA_token },
        body: JSON.stringify({
          content: 'Conflicting draft text from another device.',
          expected_version: 99,
        }),
      }
    );
    const conflictRes = await updateStoryChapter(conflictReq, {
      params: Promise.resolve({ id: testStoryId, chapterId: testChapterId }),
    });
    assert.strictEqual(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.ok(conflictData.currentChapter);
    assert.strictEqual(conflictData.currentChapter.version, 1);

    // D. Valid Update increments version and recalculates word count
    const updateReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${testChapterId}`,
      {
        method: 'PUT',
        headers: { 'x-session-token': userA_token },
        body: JSON.stringify({
          content: 'The obsidian needle hummed with cold dissonance across the silent scriptorium vault, chiming with ancient starlight.',
          expected_version: 1,
        }),
      }
    );
    const updateRes = await updateStoryChapter(updateReq, {
      params: Promise.resolve({ id: testStoryId, chapterId: testChapterId }),
    });
    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.chapter.version, 2);
    assert.strictEqual(updateData.chapter.word_count, 16);

    // E. Reorder chapters atomically
    const reorderReq = new Request(`http://localhost:3000/api/stories/${testStoryId}/chapters/reorder`, {
      method: 'POST',
      headers: { 'x-session-token': userA_token },
      body: JSON.stringify({
        chapterIds: [secondChapterId, testChapterId],
      }),
    });
    const reorderRes = await reorderStoryChapters(reorderReq, {
      params: Promise.resolve({ id: testStoryId }),
    });
    assert.strictEqual(reorderRes.status, 200);
    const reorderData = await reorderRes.json();
    assert.strictEqual(reorderData.chapters[0].id, secondChapterId);
    assert.strictEqual(reorderData.chapters[0].sequence_number, 1);
    assert.strictEqual(reorderData.chapters[1].id, testChapterId);
    assert.strictEqual(reorderData.chapters[1].sequence_number, 2);
  });

  // =========================================================================
  // 5. Manuscript Parsing & Splitter Unit Tests
  // =========================================================================
  test('5. Manuscript Parser: Chapter splitting, word counts, and formatting', () => {
    const rawMarkdown = `
# Chapter 1: The Broken Spire

The rain fell in sheets of liquid glass across the towers of Astris. Archivist Vaelen clutched his staff.

# Chapter 2: The Sunken Vault

Deep below the tide, shadows danced against the drowned limestone. Silas examined the lock.
`;

    const chapters = splitManuscriptIntoChapters(rawMarkdown, 'manuscript.md');
    assert.strictEqual(chapters.length, 2);
    assert.strictEqual(chapters[0].title, 'Chapter 1: The Broken Spire');
    assert.strictEqual(chapters[0].sequence_number, 1);
    assert.ok(chapters[0].word_count > 0);
    assert.strictEqual(chapters[1].title, 'Chapter 2: The Sunken Vault');
    assert.strictEqual(chapters[1].sequence_number, 2);

    // Test file format detection
    assert.strictEqual(detectSupportedFileType('story.txt'), 'text');
    assert.strictEqual(detectSupportedFileType('story.md'), 'markdown');
    assert.strictEqual(detectSupportedFileType('manuscript.docx'), 'docx');
    assert.throws(() => detectSupportedFileType('malicious.exe'), /Unsupported file format/);

    // Test word count calculation
    assert.strictEqual(calculateWordCount('One two   three\nfour\r\nfive.'), 5);
  });

  // =========================================================================
  // 6. Manuscript Import Preview & Duplicate Detection API
  // =========================================================================
  test('6. Manuscript Import Preview: Validate files, parse chapters, and flag duplicate imports', async () => {
    const manuscriptText = `
# Prologue: The Leyline Breach
The sky fractured like burnt vellum as starlight poured through the tear.

# Chapter 1: The Gathering Scribes
Grand Archivist Vaelen summoned the twelve scholars to the high dais.
`;

    const previewReq1 = new Request('http://localhost:3000/api/manuscript/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userA_token,
      },
      body: JSON.stringify({
        filename: 'chronicles_draft.md',
        content: manuscriptText,
      }),
    });

    const res1 = await previewManuscript(previewReq1);
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.ok(data1.preview);
    assert.strictEqual(data1.preview.file_type, 'markdown');
    assert.strictEqual(data1.preview.chapter_count, 2);
    assert.strictEqual(data1.preview.is_duplicate, false);

    // Commit import into standaloneStoryId
    const commitReq = new Request('http://localhost:3000/api/manuscript/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userA_token,
      },
      body: JSON.stringify({
        story_id: standaloneStoryId,
        filename: data1.preview.filename,
        file_type: data1.preview.file_type,
        file_size: data1.preview.file_size,
        content_hash: data1.preview.content_hash,
        chapters: data1.preview.chapters,
      }),
    });

    const commitRes = await importManuscript(commitReq);
    assert.strictEqual(commitRes.status, 201);
    const commitData = await commitRes.json();
    assert.strictEqual(commitData.chapters_created, 2);
    assert.ok(commitData.import_id);

    // Now re-run preview on identical content to verify Duplicate Detection
    const previewReq2 = new Request('http://localhost:3000/api/manuscript/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userA_token,
      },
      body: JSON.stringify({
        filename: 'chronicles_draft_copy.md',
        content: manuscriptText,
      }),
    });

    const res2 = await previewManuscript(previewReq2);
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.preview.is_duplicate, true);
    assert.ok(data2.preview.duplicate_warning?.includes('Likely duplicate import'));
  });

  // =========================================================================
  // 7. DOCX OpenXML In-Memory Import Test
  // =========================================================================
  test('7. DOCX Parser: Safely extract formatted text and structure from DOCX documents', async () => {
    const prose = 'The silver citadel gleamed above the clouds, anchored by twelve celestial chains.';
    const docxBuffer = createMockDocxBuffer(prose);

    const docxPreviewReq = new Request('http://localhost:3000/api/manuscript/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': userA_token,
      },
      body: JSON.stringify({
        filename: 'archivist_chronicle.docx',
        contentBase64: docxBuffer.toString('base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    });

    const res = await previewManuscript(docxPreviewReq);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.preview.file_type, 'docx');
    assert.ok(data.preview.chapter_count >= 1);
    assert.ok(data.preview.total_words > 0);
  });

  // =========================================================================
  // 8. Delete Chapter & Resequencing
  // =========================================================================
  test('8. Chapter Deletion: Resequences remaining chapters in story', async () => {
    const delReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${secondChapterId}`,
      {
        method: 'DELETE',
        headers: { 'x-session-token': userA_token },
      }
    );

    const delRes = await deleteStoryChapter(delReq, {
      params: Promise.resolve({ id: testStoryId, chapterId: secondChapterId }),
    });
    assert.strictEqual(delRes.status, 200);

    // Verify remaining chapters in story
    const listReq = new Request(`http://localhost:3000/api/stories/${testStoryId}/chapters`, {
      headers: { 'x-session-token': userA_token },
    });
    const listRes = await getStoryChapters(listReq, { params: Promise.resolve({ id: testStoryId }) });
    const listData = await listRes.json();
    assert.strictEqual(listData.chapters.length, 1);
    assert.strictEqual(listData.chapters[0].sequence_number, 1);
  });

  // =========================================================================
  // 9. Story Chapter Analysis & Continuity Oracle
  // =========================================================================
  test('9. Story Chapter Analysis: Aggregates linked canon, detects post-mortem violations, and records dismissals', async () => {
    // A. Update chapter 1 prose with a clear canon violation:
    // Commander Kaelen Vance died in year 340 in univ-demo-aethelgard, but appears speaking and moving
    const updateReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${testChapterId}`,
      {
        method: 'PUT',
        headers: { 'x-session-token': userA_token },
        body: JSON.stringify({
          title: 'Chapter 1: The Resurrected Commander',
          content: 'Commander Kaelen drew his astral sword and shouted orders across the high balcony of the citadel, marching into the front lines alongside his warriors.',
          expected_version: 2,
        }),
      }
    );
    const updateRes = await updateStoryChapter(updateReq, {
      params: Promise.resolve({ id: testStoryId, chapterId: testChapterId }),
    });
    assert.strictEqual(updateRes.status, 200);

    // B. Analyze the story chapter
    const analyzeReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${testChapterId}/analyze`,
      {
        method: 'POST',
        headers: { 'x-session-token': userA_token },
      }
    );
    const analyzeRes = await analyzeStoryChapter(analyzeReq, {
      params: Promise.resolve({ id: testStoryId, chapterId: testChapterId }),
    });
    assert.strictEqual(analyzeRes.status, 200);
    const analyzeData = await analyzeRes.json();
    assert.ok(analyzeData.findings.length >= 1, 'Expected at least 1 finding detected');
    
    const postMortemFinding = analyzeData.findings.find(
      (f: { category: string; title: string }) =>
        f.category === 'timeline_paradox' && f.title.includes('Post-Mortem Activity')
    );
    assert.ok(postMortemFinding, 'Expected POST_MORTEM_ACTIVITY finding for deceased character');
    assert.ok(postMortemFinding.explanation.includes('Commander Kaelen'));
    assert.strictEqual(postMortemFinding.story_id, testStoryId);

    // C. Retrieve persisted findings via GET
    const getFindingsReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${testChapterId}/findings`,
      {
        headers: { 'x-session-token': userA_token },
      }
    );
    const getFindingsRes = await getStoryFindings(getFindingsReq, {
      params: Promise.resolve({ id: testStoryId, chapterId: testChapterId }),
    });
    assert.strictEqual(getFindingsRes.status, 200);
    const getFindingsData = await getFindingsRes.json();
    assert.ok(getFindingsData.findings.length >= 1);
    assert.strictEqual(getFindingsData.findings[0].chapter_id, testChapterId);

    // D. Dismiss the finding with intentional plot device rationale
    const findingId = postMortemFinding.id;
    const patchReq = new Request(
      `http://localhost:3000/api/stories/${testStoryId}/chapters/${testChapterId}/findings/${findingId}`,
      {
        method: 'PATCH',
        headers: { 'x-session-token': userA_token },
        body: JSON.stringify({
          status: 'dismissed',
          dismissal_reason: 'plot_device',
          author_notes: 'Kaelen has been resurrected by astral necromancy in this arc.',
        }),
      }
    );
    const patchRes = await updateStoryFinding(patchReq, {
      params: Promise.resolve({
        id: testStoryId,
        chapterId: testChapterId,
        findingId,
      }),
    });
    assert.strictEqual(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.strictEqual(patchData.finding.status, 'dismissed');
    assert.strictEqual(patchData.finding.dismissal_reason, 'plot_device');
  });
});
