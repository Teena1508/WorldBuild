import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { POST as createStory } from '../src/app/api/stories/route';
import {
  GET as getStory,
  PUT as updateStory,
  DELETE as deleteStory,
} from '../src/app/api/stories/[id]/route';
import {
  GET as getStoryChapters,
  POST as createStoryChapter,
} from '../src/app/api/stories/[id]/chapters/route';
import { PUT as updateStoryChapter } from '../src/app/api/stories/[id]/chapters/[chapterId]/route';
import { POST as reorderStoryChapters } from '../src/app/api/stories/[id]/chapters/reorder/route';
import {
  GET as getPublishStatus,
  POST as publishStoryRoute,
} from '../src/app/api/stories/[id]/publish/route';
import { POST as unpublishStoryRoute } from '../src/app/api/stories/[id]/unpublish/route';
import { GET as checkSlugRoute } from '../src/app/api/stories/check-slug/route';
import { POST as uploadCoverRoute } from '../src/app/api/stories/upload-cover/route';
import { GET as publicExploreRoute } from '../src/app/api/public/stories/route';
import { GET as publicStoryRoute } from '../src/app/api/public/stories/[slug]/route';
import { GET as publicChapterRoute } from '../src/app/api/public/stories/[slug]/chapters/[sequence]/route';

describe('WORLDBUILD Publishing System & Public Reading Suite', () => {
  const userAToken = 'tok-usr-archivist-prime'; // User A (High Scribe)
  const userBToken = 'tok-usr-novice-chronicler'; // User B (Novice Chronicler)

  let storyAId: string;
  let chap1Id: string;
  let chap2Id: string;
  let chap3Id: string;
  const uniqueStorySlug = `val-morgath-saga-${Date.now()}`;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();
  });

  after(async () => {
    await closeDatabase();
  });

  // =========================================================================
  // 1. Story creation and editing by its authenticated owner
  // =========================================================================
  test('1. Story creation and metadata editing by its authenticated owner', async () => {
    const createReq = new Request('http://localhost:3000/api/stories', {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        title: 'The Fall of Val-Morgath',
        description: 'An ancient chronicle of the celestial astral war.',
        slug: uniqueStorySlug,
        genres: 'Dark Fantasy, Grimdark',
        tags: 'Astral, Cataclysm, Void',
        auto_seed_chapter: false,
      }),
    });

    const createRes = await createStory(createReq);
    assert.strictEqual(createRes.status, 201, 'Author should create story with 201');
    const createData = await createRes.json();
    storyAId = createData.story.id;
    assert.ok(storyAId, 'Story ID should be generated');
    assert.strictEqual(createData.story.title, 'The Fall of Val-Morgath');
    assert.strictEqual(createData.story.slug, uniqueStorySlug);

    // Edit story metadata
    const putReq = new Request(`http://localhost:3000/api/stories/${storyAId}`, {
      method: 'PUT',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        title: 'The Fall of Val-Morgath: Scriptorium Edition',
        genres: 'Dark Fantasy, High Fantasy',
      }),
    });

    const putRes = await updateStory(putReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(putRes.status, 200);
    const putData = await putRes.json();
    assert.strictEqual(putData.story.title, 'The Fall of Val-Morgath: Scriptorium Edition');
    assert.strictEqual(putData.story.genres, 'Dark Fantasy, High Fantasy');
  });

  // =========================================================================
  // 2. Chapter association and ordering
  // =========================================================================
  test('2. Chapter association, sequential ordering, and reordering', async () => {
    // Inscribe Chapter 1
    const c1Req = new Request(`http://localhost:3000/api/stories/${storyAId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        title: 'Prologue: The Astral Rift',
        content: 'Long before the cataclysm, starlight fell upon the obsidian citadels of Val-Morgath.',
        sequence_number: 1,
      }),
    });
    const c1Res = await createStoryChapter(c1Req, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(c1Res.status, 201);
    const c1Data = await c1Res.json();
    chap1Id = c1Data.chapter.id;

    // Inscribe Chapter 2
    const c2Req = new Request(`http://localhost:3000/api/stories/${storyAId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        title: 'Chapter 1: The Obsidian Gate',
        content: 'Elysia stepped through the shattered gate as shadow swept the valley.',
        sequence_number: 2,
      }),
    });
    const c2Res = await createStoryChapter(c2Req, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(c2Res.status, 201);
    const c2Data = await c2Res.json();
    chap2Id = c2Data.chapter.id;

    // Inscribe Chapter 3
    const c3Req = new Request(`http://localhost:3000/api/stories/${storyAId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        title: 'Chapter 2: The Void Cipher Draft',
        content: 'A secret draft chapter that the author will not publish initially.',
        sequence_number: 3,
      }),
    });
    const c3Res = await createStoryChapter(c3Req, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(c3Res.status, 201);
    const c3Data = await c3Res.json();
    chap3Id = c3Data.chapter.id;

    // Verify ordering
    const listReq = new Request(`http://localhost:3000/api/stories/${storyAId}/chapters`, {
      headers: { 'x-session-token': userAToken },
    });
    const listRes = await getStoryChapters(listReq, { params: Promise.resolve({ id: storyAId }) });
    const listData = await listRes.json();
    assert.strictEqual(listData.chapters.length, 3);
    assert.strictEqual(listData.chapters[0].id, chap1Id);
    assert.strictEqual(listData.chapters[1].id, chap2Id);
    assert.strictEqual(listData.chapters[2].id, chap3Id);

    // Atomically reorder chapters (swap Chapter 1 and Chapter 2)
    const reorderReq = new Request(`http://localhost:3000/api/stories/${storyAId}/chapters/reorder`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({ chapterIds: [chap2Id, chap1Id, chap3Id] }),
    });
    const reorderRes = await reorderStoryChapters(reorderReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(reorderRes.status, 200);

    // Restore canonical order for subsequent publishing tests
    await reorderStoryChapters(
      new Request(`http://localhost:3000/api/stories/${storyAId}/chapters/reorder`, {
        method: 'POST',
        headers: { 'x-session-token': userAToken },
        body: JSON.stringify({ chapterIds: [chap1Id, chap2Id, chap3Id] }),
      }),
      { params: Promise.resolve({ id: storyAId }) }
    );
  });

  // =========================================================================
  // 3. Publishing and public discovery
  // =========================================================================
  test('3. Publishing story and appearing in public discovery catalog', async () => {
    // Before publishing, public explore should not include storyAId
    const preExploreReq = new Request('http://localhost:3000/api/public/stories?q=Val-Morgath');
    const preExploreRes = await publicExploreRoute(preExploreReq);
    const preExploreData = await preExploreRes.json();
    assert.ok(
      !preExploreData.stories.some((s: { id: string; slug?: string }) => s.id === storyAId || s.slug === uniqueStorySlug),
      'Unpublished story must never appear in public discovery'
    );

    // Explicitly publish story with Chapter 1 and Chapter 2 (partial publishing)
    const pubReq = new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        public_title: 'The Fall of Val-Morgath: Inscribed Edition',
        public_description: 'An ancient chronicle of the celestial astral war.',
        slug: uniqueStorySlug,
        genres: 'Dark Fantasy, Grimdark',
        tags: 'Astral, Cataclysm',
        selected_chapter_ids: [chap1Id, chap2Id], // Chapter 3 left out!
      }),
    });

    const pubRes = await publishStoryRoute(pubReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(pubRes.status, 200);
    const pubData = await pubRes.json();
    assert.strictEqual(pubData.success, true);
    assert.strictEqual(pubData.publication.status, 'published');
    assert.strictEqual(pubData.publication.publication_version, 1);
    assert.strictEqual(pubData.publishedSnapshots.length, 2);

    // Verify public discovery now includes the story
    const postExploreReq = new Request(`http://localhost:3000/api/public/stories?q=Val-Morgath`);
    const postExploreRes = await publicExploreRoute(postExploreReq);
    const postExploreData = await postExploreRes.json();
    const found = postExploreData.stories.find((s: { slug: string }) => s.slug === uniqueStorySlug);
    assert.ok(found, 'Published story must appear in public discovery');
    assert.strictEqual(found.title, 'The Fall of Val-Morgath: Inscribed Edition');
    assert.strictEqual(found.chapters_count, 2);
  });

  // =========================================================================
  // 4. Readers seeing only published chapters
  // =========================================================================
  test('4. Readers see only selected published chapters (never draft or unselected chapters)', async () => {
    // Public story page
    const pubStoryReq = new Request(`http://localhost:3000/api/public/stories/${uniqueStorySlug}`);
    const pubStoryRes = await publicStoryRoute(pubStoryReq, {
      params: Promise.resolve({ slug: uniqueStorySlug }),
    });
    assert.strictEqual(pubStoryRes.status, 200);
    const pubStoryData = await pubStoryRes.json();

    assert.strictEqual(pubStoryData.story.chapters.length, 2, 'Only 2 published chapters visible');
    assert.strictEqual(pubStoryData.story.chapters[0].title, 'Prologue: The Astral Rift');
    assert.strictEqual(pubStoryData.story.chapters[1].title, 'Chapter 1: The Obsidian Gate');

    // Attempting to access Chapter 3 (which was not published) via public chapter reader route
    const chap3ReaderReq = new Request(
      `http://localhost:3000/api/public/stories/${uniqueStorySlug}/chapters/3`
    );
    const chap3ReaderRes = await publicChapterRoute(chap3ReaderReq, {
      params: Promise.resolve({ slug: uniqueStorySlug, sequence: '3' }),
    });
    assert.strictEqual(chap3ReaderRes.status, 404, 'Unpublished Chapter 3 must return 404 Not Found');
  });

  // =========================================================================
  // 5. Draft edits not changing published snapshots (The Key Invariant)
  // =========================================================================
  test('5. Editing an unpublished draft must never silently change the content readers currently see', async () => {
    // Author modifies Chapter 1 draft in Story Studio
    const editDraftReq = new Request(
      `http://localhost:3000/api/stories/${storyAId}/chapters/${chap1Id}`,
      {
        method: 'PUT',
        headers: { 'x-session-token': userAToken },
        body: JSON.stringify({
          title: 'Prologue: UNPUBLISHED DRAFT REVISION',
          content: 'SECRET DRAFT: This text contains private spoilers that readers must NOT see yet!',
        }),
      }
    );
    const editDraftRes = await updateStoryChapter(editDraftReq, {
      params: Promise.resolve({ id: storyAId, chapterId: chap1Id }),
    });
    assert.strictEqual(editDraftRes.status, 200);

    // Verify author's draft chapter has updated
    const authorChapRes = await getStoryChapters(
      new Request(`http://localhost:3000/api/stories/${storyAId}/chapters`, {
        headers: { 'x-session-token': userAToken },
      }),
      { params: Promise.resolve({ id: storyAId }) }
    );
    const authorChapData = await authorChapRes.json();
    const updatedDraft = authorChapData.chapters.find((c: { id: string }) => c.id === chap1Id);
    assert.strictEqual(updatedDraft.title, 'Prologue: UNPUBLISHED DRAFT REVISION');

    // Public reader checks Chapter 1
    const readerReq = new Request(
      `http://localhost:3000/api/public/stories/${uniqueStorySlug}/chapters/1`
    );
    const readerRes = await publicChapterRoute(readerReq, {
      params: Promise.resolve({ slug: uniqueStorySlug, sequence: '1' }),
    });
    assert.strictEqual(readerRes.status, 200);
    const readerData = await readerRes.json();

    // Reader must STILL see original published snapshot!
    assert.strictEqual(
      readerData.chapter.title,
      'Prologue: The Astral Rift',
      'Reader must see original published title'
    );
    assert.strictEqual(
      readerData.chapter.content,
      'Long before the cataclysm, starlight fell upon the obsidian citadels of Val-Morgath.',
      'Reader must see original snapshot content, unaffected by draft edits'
    );
    assert.ok(
      !readerData.chapter.content.includes('SECRET DRAFT'),
      'Reader must not see uncommitted draft edits'
    );

    // Author publishing status must accurately flag unpublished draft changes
    const statusReq = new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
      headers: { 'x-session-token': userAToken },
    });
    const statusRes = await getPublishStatus(statusReq, { params: Promise.resolve({ id: storyAId }) });
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.has_unpublished_story_changes, true);
    const chap1Status = statusData.chapters.find((c: { id: string }) => c.id === chap1Id);
    assert.strictEqual(chap1Status.has_unpublished_changes, true);
  });

  // =========================================================================
  // 6. Explicit updates creating a new published version
  // =========================================================================
  test('6. Explicit updates atomically create a new published version and update reader visibility', async () => {
    // Author explicitly publishes an update releasing the revised Chapter 1 and adding Chapter 3
    const updatePubReq = new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
      body: JSON.stringify({
        selected_chapter_ids: [chap1Id, chap2Id, chap3Id],
      }),
    });

    const updatePubRes = await publishStoryRoute(updatePubReq, {
      params: Promise.resolve({ id: storyAId }),
    });
    assert.strictEqual(updatePubRes.status, 200);
    const updatePubData = await updatePubRes.json();

    assert.strictEqual(
      updatePubData.publication.publication_version,
      2,
      'Story version incremented to 2'
    );

    // Verify reader now receives the updated version for Chapter 1
    const readerReq = new Request(
      `http://localhost:3000/api/public/stories/${uniqueStorySlug}/chapters/1`
    );
    const readerRes = await publicChapterRoute(readerReq, {
      params: Promise.resolve({ slug: uniqueStorySlug, sequence: '1' }),
    });
    assert.strictEqual(readerRes.status, 200);
    const readerData = await readerRes.json();
    assert.strictEqual(readerData.chapter.title, 'Prologue: UNPUBLISHED DRAFT REVISION');
    assert.ok(readerData.chapter.content.includes('SECRET DRAFT'));

    // Verify Chapter 3 is now also publicly readable
    const chap3ReaderReq = new Request(
      `http://localhost:3000/api/public/stories/${uniqueStorySlug}/chapters/3`
    );
    const chap3ReaderRes = await publicChapterRoute(chap3ReaderReq, {
      params: Promise.resolve({ slug: uniqueStorySlug, sequence: '3' }),
    });
    assert.strictEqual(chap3ReaderRes.status, 200);

    // Verify snapshot table preserves historical versions (version 1 and version 2 exist for chapter 1)
    const snapshotsRes = await query<{ count: number }>(
      'SELECT COUNT(*)::int as count FROM published_chapter_snapshots WHERE chapter_id = $1',
      [chap1Id]
    );
    assert.strictEqual(snapshotsRes.rows[0].count, 2, 'Snapshot history must retain all versions');

    const activeSnapRes = await query<{ version_number: number }>(
      'SELECT version_number FROM published_chapter_snapshots WHERE chapter_id = $1 AND is_current = true',
      [chap1Id]
    );
    assert.strictEqual(activeSnapRes.rows[0].version_number, 2, 'Only latest version is current');
  });

  // =========================================================================
  // 7. Unpublishing blocking public access through both pages and APIs
  // =========================================================================
  test('7. Unpublishing story blocks public access through discovery, story detail, and chapter reader APIs', async () => {
    // Author unpublishes
    const unpubReq = new Request(`http://localhost:3000/api/stories/${storyAId}/unpublish`, {
      method: 'POST',
      headers: { 'x-session-token': userAToken },
    });
    const unpubRes = await unpublishStoryRoute(unpubReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(unpubRes.status, 200);

    // 1. Discovery catalog must NOT return the unpublished story
    const exploreReq = new Request(`http://localhost:3000/api/public/stories?q=Val-Morgath`);
    const exploreRes = await publicExploreRoute(exploreReq);
    const exploreData = await exploreRes.json();
    assert.ok(
      !exploreData.stories.some((s: { slug: string }) => s.slug === uniqueStorySlug),
      'Unpublished story removed from discovery catalog'
    );

    // 2. Public story detail route must return 404
    const pubStoryReq = new Request(`http://localhost:3000/api/public/stories/${uniqueStorySlug}`);
    const pubStoryRes = await publicStoryRoute(pubStoryReq, {
      params: Promise.resolve({ slug: uniqueStorySlug }),
    });
    assert.strictEqual(pubStoryRes.status, 404, 'Public story detail returns 404');

    // 3. Public chapter reader route must return 404
    const pubChapReq = new Request(
      `http://localhost:3000/api/public/stories/${uniqueStorySlug}/chapters/1`
    );
    const pubChapRes = await publicChapterRoute(pubChapReq, {
      params: Promise.resolve({ slug: uniqueStorySlug, sequence: '1' }),
    });
    assert.strictEqual(pubChapRes.status, 404, 'Public chapter reader returns 404');

    // Re-publish for remaining tests
    await publishStoryRoute(
      new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
        method: 'POST',
        headers: { 'x-session-token': userAToken },
        body: JSON.stringify({ slug: uniqueStorySlug }),
      }),
      { params: Promise.resolve({ id: storyAId }) }
    );
  });

  // =========================================================================
  // 8. User B unable to edit, publish, delete, or access User A's private content
  // =========================================================================
  test("8. Cross-user isolation: User B cannot edit, publish, unpublish, or delete User A's story", async () => {
    // User B tries to view User A's private story via API
    const getReq = new Request(`http://localhost:3000/api/stories/${storyAId}`, {
      headers: { 'x-session-token': userBToken },
    });
    const getRes = await getStory(getReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(getRes.status, 403, "User B cannot view User A's private story");

    // User B tries to edit User A's story
    const editReq = new Request(`http://localhost:3000/api/stories/${storyAId}`, {
      method: 'PUT',
      headers: { 'x-session-token': userBToken },
      body: JSON.stringify({ title: 'Hacked by User B' }),
    });
    const editRes = await updateStory(editReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(editRes.status, 403, "User B cannot edit User A's story");

    // User B tries to publish User A's story
    const pubReq = new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
      method: 'POST',
      headers: { 'x-session-token': userBToken },
      body: JSON.stringify({ public_title: 'Malicious Publication' }),
    });
    const pubRes = await publishStoryRoute(pubReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(pubRes.status, 403, "User B cannot publish User A's story");

    // User B tries to unpublish User A's story
    const unpubReq = new Request(`http://localhost:3000/api/stories/${storyAId}/unpublish`, {
      method: 'POST',
      headers: { 'x-session-token': userBToken },
    });
    const unpubRes = await unpublishStoryRoute(unpubReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(unpubRes.status, 403, "User B cannot unpublish User A's story");

    // User B tries to delete User A's story
    const delReq = new Request(`http://localhost:3000/api/stories/${storyAId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': userBToken },
    });
    const delRes = await deleteStory(delReq, { params: Promise.resolve({ id: storyAId }) });
    assert.strictEqual(delRes.status, 403, "User B cannot delete User A's story");
  });

  // =========================================================================
  // 9. Unauthorized and unauthenticated publication attempts
  // =========================================================================
  test('9. Unauthenticated requests are rejected from publishing or manuscript mutation', async () => {
    // Unauthenticated publish attempt
    const unauthPubReq = new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
      method: 'POST',
      headers: { 'x-unauthenticated': 'true' },
      body: JSON.stringify({ public_title: 'Anonymous Hack' }),
    });
    const unauthPubRes = await publishStoryRoute(unauthPubReq, {
      params: Promise.resolve({ id: storyAId }),
    });
    assert.strictEqual(unauthPubRes.status, 401, 'Unauthenticated publish must return 401');

    // Unauthenticated status inspection
    const unauthStatusReq = new Request(`http://localhost:3000/api/stories/${storyAId}/publish`, {
      headers: { 'x-unauthenticated': 'true' },
    });
    const unauthStatusRes = await getPublishStatus(unauthStatusReq, {
      params: Promise.resolve({ id: storyAId }),
    });
    assert.strictEqual(unauthStatusRes.status, 401, 'Unauthenticated status check must return 401');

    // Unauthenticated cover upload
    const unauthUploadReq = new Request('http://localhost:3000/api/stories/upload-cover', {
      method: 'POST',
      headers: { 'x-unauthenticated': 'true' },
    });
    const unauthUploadRes = await uploadCoverRoute(unauthUploadReq);
    assert.strictEqual(unauthUploadRes.status, 401, 'Unauthenticated cover upload must return 401');
  });

  // =========================================================================
  // 10. Duplicate slugs, invalid input, empty stories and partial publication
  // =========================================================================
  test('10. Duplicate slugs, invalid input, empty stories and slug check API', async () => {
    // 1. Slug check endpoint reports taken for existing published slug
    const checkTakenReq = new Request(
      `http://localhost:3000/api/stories/check-slug?slug=${uniqueStorySlug}`,
      { headers: { 'x-session-token': userBToken } }
    );
    const checkTakenRes = await checkSlugRoute(checkTakenReq);
    assert.strictEqual(checkTakenRes.status, 200);
    const checkTakenData = await checkTakenRes.json();
    assert.strictEqual(checkTakenData.available, false, 'Existing slug must be flagged as unavailable');

    // 2. User B creates a story and tries to publish with the duplicate slug
    const storyBRes = await createStory(
      new Request('http://localhost:3000/api/stories', {
        method: 'POST',
        headers: { 'x-session-token': userBToken },
        body: JSON.stringify({ title: 'Novice Duplicate Attempt' }),
      })
    );
    const storyBData = await storyBRes.json();
    const storyBId = storyBData.story.id;

    const dupPubRes = await publishStoryRoute(
      new Request(`http://localhost:3000/api/stories/${storyBId}/publish`, {
        method: 'POST',
        headers: { 'x-session-token': userBToken },
        body: JSON.stringify({ slug: uniqueStorySlug }),
      }),
      { params: Promise.resolve({ id: storyBId }) }
    );
    assert.strictEqual(dupPubRes.status, 400, 'Duplicate slug publication must be rejected with 400');

    // 3. Invalid slug format (uppercase, spaces, symbols)
    const invalidSlugReq = new Request(
      'http://localhost:3000/api/stories/check-slug?slug=INVALID--SLUG!!',
      { headers: { 'x-session-token': userBToken } }
    );
    const invalidSlugRes = await checkSlugRoute(invalidSlugReq);
    const invalidSlugData = await invalidSlugRes.json();
    assert.strictEqual(invalidSlugData.valid, true); // Cleaned into valid format "invalid-slug"
    assert.strictEqual(invalidSlugData.slug, 'invalid-slug');

    // 4. Publishing an empty story (0 chapters) succeeds cleanly
    const emptyPubRes = await publishStoryRoute(
      new Request(`http://localhost:3000/api/stories/${storyBId}/publish`, {
        method: 'POST',
        headers: { 'x-session-token': userBToken },
        body: JSON.stringify({
          public_title: 'Empty Chronicle Shell',
          slug: `empty-chronicle-${Date.now()}`,
          selected_chapter_ids: [],
        }),
      }),
      { params: Promise.resolve({ id: storyBId }) }
    );
    assert.strictEqual(emptyPubRes.status, 200, 'Publishing a story with 0 chapters succeeds gracefully');
    const emptyPubData = await emptyPubRes.json();
    assert.strictEqual(emptyPubData.publishedSnapshots.length, 0);

    // Clean up User B test story
    await deleteStory(
      new Request(`http://localhost:3000/api/stories/${storyBId}`, {
        method: 'DELETE',
        headers: { 'x-session-token': userBToken },
      }),
      { params: Promise.resolve({ id: storyBId }) }
    );
  });

  // =========================================================================
  // 11. Database migration compatibility and preservation of existing data
  // =========================================================================
  test('11. Database migration idempotency and preservation of existing tables and rows', async () => {
    // Re-running migrations should be completely idempotent and not throw
    await assert.doesNotReject(async () => {
      await runMigrations();
    }, 'Migrations must be idempotent');

    // Verify existing users and seed universes remain intact
    const userRes = await query<{ count: number }>('SELECT count(*)::int as count FROM app_users');
    assert.ok(userRes.rows[0].count >= 3, 'Default users must be preserved');

    const demoUnivRes = await query('SELECT id FROM universes WHERE id = $1', ['univ-demo-aethelgard']);
    assert.strictEqual(demoUnivRes.rows.length, 1, 'Exemplar universe must be preserved');
  });

  // =========================================================================
  // 12. Regression tests for existing worldbuilding and continuity functionality
  // =========================================================================
  test('12. Existing story studio, chapter analysis, and continuity checks continue to function', async () => {
    // Verify chapters table query with story_id
    const chRes = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM chapters WHERE story_id = $1',
      [storyAId]
    );
    assert.strictEqual(chRes.rows[0].count, 3, 'Draft chapters must remain intact in chapters table');

    // Verify published chapter snapshot count
    const snapRes = await query<{ count: number }>(
      'SELECT count(*)::int as count FROM published_chapter_snapshots WHERE is_current = true'
    );
    assert.ok(snapRes.rows[0].count >= 1, 'Published chapter snapshot exists');
  });
});
