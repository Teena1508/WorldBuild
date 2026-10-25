import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { runMigrations, query, closeDatabase } from '../src/lib/db';
import { ensureDefaultUsers } from '../src/lib/auth/session';
import { POST as createUniverse } from '../src/app/api/universes/route';
import { POST as createChapter } from '../src/app/api/universes/[id]/chapters/route';
import {
  PUT as updateChapter,
} from '../src/app/api/universes/[id]/chapters/[chapterId]/route';
import {
  GET as getEntityLinks,
} from '../src/app/api/universes/[id]/chapters/[chapterId]/entities/route';
import {
  PATCH as updateEntityLink,
} from '../src/app/api/universes/[id]/chapters/[chapterId]/entities/[linkId]/route';
import {
  POST as registerCandidateEntity,
} from '../src/app/api/universes/[id]/chapters/[chapterId]/entities/[linkId]/register/route';
import { GET as getCharacterDetails } from '../src/app/api/universes/[id]/characters/[characterId]/route';
import { GET as getLocationDetails } from '../src/app/api/universes/[id]/locations/[locationId]/route';
import { ChapterEntityLink } from '../src/lib/db/types';
import {
  processChapterEntityTracking,
} from '../src/lib/continuity/entity-tracker';
import { validateLocalRuntimeUrl } from '../src/lib/ai/ollama';

describe('Automatic Chapter Entity & Lore Tracking Suite', () => {
  let primaryUniverseId: string;
  let secondaryUniverseId: string;
  let charElysiaId: string;
  let charVaelId: string;
  let locCitadelId: string;
  let locWhisperingWoodsId: string;
  let eventCataclysmId: string;

  async function createTestChapter(title: string, content: string): Promise<string> {
    const chapReq = new Request(`http://localhost:3000/api/universes/${primaryUniverseId}/chapters`, {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title,
        content,
        sequence_number: Math.floor(Math.random() * 1000) + 1,
      }),
    });
    const chapRes = await createChapter(chapReq, { params: Promise.resolve({ id: primaryUniverseId }) });
    const chapData = await chapRes.json();
    return chapData.chapter.id;
  }

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';
    await runMigrations();
    await ensureDefaultUsers();

    // 1. Create Primary Universe for Author
    const uReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-archivist-prime' },
      body: JSON.stringify({
        title: 'Chronicles of Solaria',
        description: 'Primary testing universe for entity tracking',
      }),
    });
    const uRes = await createUniverse(uReq);
    const uData = await uRes.json();
    primaryUniverseId = uData.universe.id;

    // 2. Create Secondary Universe for Cross-Universe Isolation
    const alienReq = new Request('http://localhost:3000/api/universes', {
      method: 'POST',
      headers: { 'x-session-token': 'tok-usr-novice-chronicler' },
      body: JSON.stringify({
        title: 'Shadow Realm',
        description: 'Isolated universe to test boundaries',
      }),
    });
    const alienRes = await createUniverse(alienReq);
    const alienData = await alienRes.json();
    secondaryUniverseId = alienData.universe.id;

    // 3. Populate Canonical Lore in Primary Universe
    // Character: Elysia with aliases
    charElysiaId = 'char-elysia-001';
    await query(
      `INSERT INTO characters (id, universe_id, name, epithet, aliases, bio, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'alive')`,
      [
        charElysiaId,
        primaryUniverseId,
        'Elysia',
        'The Dreamweaver',
        'The Starlight Sage, Daughter of the Stars',
        'A powerful weaver of astral dreams.',
      ]
    );

    // Character: Lord Vael with single alias
    charVaelId = 'char-vael-002';
    await query(
      `INSERT INTO characters (id, universe_id, name, epithet, aliases, bio, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'alive')`,
      [
        charVaelId,
        primaryUniverseId,
        'Lord Vael',
        'The Iron Chancellor',
        'Vael, Commander Vael',
        'Ruler of the northern marches.',
      ]
    );

    // Location: Citadel of Glass with aliases
    locCitadelId = 'loc-citadel-001';
    await query(
      `INSERT INTO locations (id, universe_id, name, aliases, description, realm)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        locCitadelId,
        primaryUniverseId,
        'Citadel of Glass',
        'Glass Citadel, High Spire',
        'The crystalline capital of Solaria.',
        'Upper Reaches',
      ]
    );

    // Location: Whispering Woods
    locWhisperingWoodsId = 'loc-woods-002';
    await query(
      `INSERT INTO locations (id, universe_id, name, aliases, description, realm)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        locWhisperingWoodsId,
        primaryUniverseId,
        'Whispering Woods',
        'The Deep Timber',
        'Ancient forest filled with murmuring leaves.',
        'Lowland',
      ]
    );

    // Event: Astral Cataclysm
    eventCataclysmId = 'event-cataclysm-001';
    await query(
      `INSERT INTO events (id, universe_id, title, description, timestamp_year)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventCataclysmId,
        primaryUniverseId,
        'The Astral Cataclysm',
        'The day the heavens shattered above the citadel.',
        500,
      ]
    );

    // Populate Secondary Universe with distinct lore entity
    await query(
      `INSERT INTO characters (id, universe_id, name, bio, status)
       VALUES ('char-alien-001', $1, 'Xel-Naga', 'Alien presence in secondary universe', 'alive')`,
      [secondaryUniverseId]
    );
  });

  after(async () => {
    await closeDatabase();
  });

  test('1. Exact character and location matching with scene participation classification', async () => {
    const prose = `
      Deep within the halls of the Citadel of Glass, the morning bells tolled.
      Elysia walked softly across the translucent floors.
      "The time has come," said Elysia, looking toward the horizon.
      Elysia drew her starlight focus and whispered an incantation.
      Far to the west, she wondered what was happening in the Whispering Woods.
    `;
    const chapId = await createTestChapter('Chapter 1: The Glass Awakening', prose);

    // Retrieve entity links
    const linksReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/chapters/${chapId}/entities`,
      { headers: { 'x-session-token': 'tok-usr-archivist-prime' } }
    );
    const linksRes = await getEntityLinks(linksReq, {
      params: Promise.resolve({ id: primaryUniverseId, chapterId: chapId }),
    });
    const linksData = await linksRes.json();
    const links = linksData.links;

    // Verify Elysia was detected with 'appears' relationship (3 mentions + dialogue)
    const elysiaLink = links.find((l: ChapterEntityLink) => l.character_id === charElysiaId);
    assert.ok(elysiaLink, 'Elysia must be detected');
    assert.strictEqual(elysiaLink.entity_name, 'Elysia');
    assert.strictEqual(elysiaLink.relationship_type, 'appears');
    assert.strictEqual(elysiaLink.mention_count, 3);
    assert.strictEqual(elysiaLink.status, 'detected');
    assert.ok(elysiaLink.passage?.includes('Elysia'));

    // Verify Citadel of Glass was detected as 'setting' (at start of chapter)
    const citadelLink = links.find((l: ChapterEntityLink) => l.location_id === locCitadelId);
    assert.ok(citadelLink, 'Citadel of Glass must be detected');
    assert.strictEqual(citadelLink.relationship_type, 'setting');

    // Verify Whispering Woods was detected as 'mentioned' (1 passing reference)
    const woodsLink = links.find((l: ChapterEntityLink) => l.location_id === locWhisperingWoodsId);
    assert.ok(woodsLink, 'Whispering Woods must be detected');
    assert.strictEqual(woodsLink.relationship_type, 'mentioned');
    assert.strictEqual(woodsLink.mention_count, 1);
  });

  test('2. Alias matching and avoidance of false positive substring matches', async () => {
    const textWithAliases = `
      The Starlight Sage arrived in silence.
      She had traveled far from the Glass Citadel to escape the council.
      Her companion looked into a glass mirror, wondering about the vae victis proclamation.
    `;
    const chapId = await createTestChapter('Chapter 2: Alias Test', textWithAliases);

    const linksReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/chapters/${chapId}/entities`,
      { headers: { 'x-session-token': 'tok-usr-archivist-prime' } }
    );
    const linksRes = await getEntityLinks(linksReq, {
      params: Promise.resolve({ id: primaryUniverseId, chapterId: chapId }),
    });
    const linksData = await linksRes.json();
    const links = linksData.links;

    // Verify Elysia matched via alias
    const elysiaLink = links.find((l: ChapterEntityLink) => l.character_id === charElysiaId);
    assert.ok(elysiaLink, 'Elysia matched via alias The Starlight Sage');
    assert.strictEqual(elysiaLink.matched_alias, 'The Starlight Sage');

    // Verify Citadel of Glass matched via alias Glass Citadel
    const citadelLink = links.find((l: ChapterEntityLink) => l.location_id === locCitadelId);
    assert.ok(citadelLink, 'Citadel of Glass matched via alias Glass Citadel');
    assert.strictEqual(citadelLink.matched_alias, 'Glass Citadel');

    // Verify Lord Vael is NOT matched just because "vae" was in "vae victis"
    const vaelLink = links.find((l: ChapterEntityLink) => l.character_id === charVaelId);
    assert.strictEqual(vaelLink, undefined, 'No false positive for Lord Vael on substring vae');
  });

  test('3. Repeated mentions and duplicate prevention safeguard', async () => {
    const textRepeats = `
      The Astral Cataclysm had scarred the skies forever.
      None could forget the day of the Astral Cataclysm.
      And when the stars fell again, the Astral Cataclysm was whispered once more.
    `;
    const chapId = await createTestChapter('Chapter 3: Repetition Test', textRepeats);

    // Verify single link record exists in database for the event, with mention_count = 3
    const linksDb = await query<ChapterEntityLink>(
      `SELECT * FROM chapter_entity_links WHERE chapter_id = $1 AND event_id = $2`,
      [chapId, eventCataclysmId]
    );
    assert.strictEqual(linksDb.rows.length, 1, 'Exactly one link record despite repeated mentions');
    assert.strictEqual(linksDb.rows[0].mention_count, 3, 'Mention count recorded accurately');
  });

  test('4. Preservation of author-confirmed relationships and manual edits', async () => {
    const prose = `Elysia stood looking at the Citadel of Glass.`;
    const chapId = await createTestChapter('Chapter 4: Author Edits', prose);

    // Find Elysia link
    const linksRes1 = await query<ChapterEntityLink>(
      `SELECT * FROM chapter_entity_links WHERE chapter_id = $1 AND character_id = $2`,
      [chapId, charElysiaId]
    );
    assert.ok(linksRes1.rows.length > 0);
    const linkId = linksRes1.rows[0].id;

    // Author manually confirms the link and sets notes
    const patchReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/chapters/${chapId}/entities/${linkId}`,
      {
        method: 'PATCH',
        headers: { 'x-session-token': 'tok-usr-archivist-prime', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'confirmed',
          relationship_type: 'appears',
          author_notes: 'Deliberate canon appearance verified by author',
        }),
      }
    );
    const patchRes = await updateEntityLink(patchReq, {
      params: Promise.resolve({ id: primaryUniverseId, chapterId: chapId, linkId }),
    });
    assert.strictEqual(patchRes.status, 200);

    // Now reprocess the chapter with completely different text that no longer mentions Elysia
    const newProse = `The solitary raven circled the empty sky above nothing.`;
    await processChapterEntityTracking({
      chapterId: chapId,
      universeId: primaryUniverseId,
      manuscriptContent: newProse,
    });

    // Author confirmed link MUST NOT be deleted!
    const linksRes2 = await query<ChapterEntityLink>(`SELECT * FROM chapter_entity_links WHERE id = $1`, [linkId]);
    assert.strictEqual(linksRes2.rows.length, 1, 'Author confirmed link was preserved');
    assert.strictEqual(linksRes2.rows[0].status, 'confirmed', 'Status remained confirmed');
    assert.strictEqual(linksRes2.rows[0].is_stale, true, 'Marked as stale because text changed');
  });

  test('5. Safe manuscript persistence when entity detection fails', async () => {
    const chapId = await createTestChapter('Chapter 5: Resilience Test', 'Initial content');
    const validProse = `A new chapter manuscript text written during an offline disruption.`;
    const putReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/chapters/${chapId}`,
      {
        method: 'PUT',
        headers: { 'x-session-token': 'tok-usr-archivist-prime' },
        body: JSON.stringify({
          title: 'Resilient Manuscript Title',
          content: validProse,
          expected_version: 1,
        }),
      }
    );
    const putRes = await updateChapter(putReq, {
      params: Promise.resolve({ id: primaryUniverseId, chapterId: chapId }),
    });
    assert.strictEqual(putRes.status, 200);
    const data = await putRes.json();
    assert.strictEqual(data.chapter.content, validProse, 'Manuscript text was persisted safely');
  });

  test('6. Unregistered candidate detection and author inscription into canon', async () => {
    const textWithUnknown = `
      Lord Morpheus raised his dark banner over the Obsidian Tower.
    `;
    const chapId = await createTestChapter('Chapter 6: Unknown Entity Test', textWithUnknown);

    // Check for detected candidate
    const candidateLinks = await query<ChapterEntityLink>(
      `SELECT * FROM chapter_entity_links WHERE chapter_id = $1 AND entity_type = 'unknown'`,
      [chapId]
    );
    assert.ok(candidateLinks.rows.length > 0, 'Detected unknown candidate entity');
    const cand = candidateLinks.rows.find((r: ChapterEntityLink) => r.entity_name.includes('Lord Morpheus') || r.entity_name.includes('Morpheus'));
    assert.ok(cand, 'Lord Morpheus was flagged as an unregistered entity candidate');
    assert.strictEqual(cand.status, 'needs_review');

    // Author registers candidate as a new canonical character
    const regReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/chapters/${chapId}/entities/${cand.id}/register`,
      {
        method: 'POST',
        headers: { 'x-session-token': 'tok-usr-archivist-prime', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'character',
          name: 'Lord Morpheus',
          bio: 'Keeper of dreams and shadows.',
          realm: 'The Dark Marches',
        }),
      }
    );
    const regRes = await registerCandidateEntity(regReq, {
      params: Promise.resolve({ id: primaryUniverseId, chapterId: chapId, linkId: cand.id }),
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    assert.ok(regData.character, 'Canonical character created');
    assert.strictEqual(regData.character.name, 'Lord Morpheus');
    assert.strictEqual(regData.link.status, 'confirmed', 'Link upgraded to confirmed canonical character');
    assert.strictEqual(regData.link.character_id, regData.character.id);
  });

  test('7. Cross-universe and cross-user isolation', async () => {
    const textAlien = `The traveler spoke of Xel-Naga, a myth from another world.`;
    const chapId = await createTestChapter('Chapter 7: Alien Isolation', textAlien);

    // Entity links in primary universe should NEVER link to secondary universe character
    const crossCheck = await query(
      `SELECT * FROM chapter_entity_links WHERE chapter_id = $1 AND entity_name = 'Xel-Naga' AND character_id IS NOT NULL`,
      [chapId]
    );
    assert.strictEqual(crossCheck.rows.length, 0, 'No cross-universe character leak');

    // User B (novice chronicler) cannot read or modify chapter entity links in primary universe
    const unauthorizedReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/chapters/${chapId}/entities`,
      { headers: { 'x-session-token': 'tok-usr-novice-chronicler' } }
    );
    const unauthRes = await getEntityLinks(unauthorizedReq, {
      params: Promise.resolve({ id: primaryUniverseId, chapterId: chapId }),
    });
    assert.strictEqual(unauthRes.status, 403, 'Cross-user access denied with 403');
  });

  test('8. Character Codex and Location tabs reflect chapter appearances and passages', async () => {
    const sceneProse = `Elysia walked into the grand plaza of the Citadel of Glass during the ceremony.`;
    const chapId = await createTestChapter('Chapter 8: Codex Display', sceneProse);

    // Character dossier route
    const charReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/characters/${charElysiaId}`,
      { headers: { 'x-session-token': 'tok-usr-archivist-prime' } }
    );
    const charRes = await getCharacterDetails(charReq, {
      params: Promise.resolve({ id: primaryUniverseId, characterId: charElysiaId }),
    });
    assert.strictEqual(charRes.status, 200);
    const charData = await charRes.json();
    assert.ok(charData.chapter_appearances, 'Character has chapter appearances list');
    assert.ok(charData.chapter_appearances.length > 0);
    interface AppearanceItem {
      chapter_id: string;
      passage: string;
      associated_locations: Array<{ name: string }>;
      associated_characters: Array<{ name: string }>;
    }
    const appearance = (charData.chapter_appearances as AppearanceItem[]).find((a) => a.chapter_id === chapId);
    assert.ok(appearance, 'Appearance in Chapter 8 found');
    assert.ok(appearance.passage.includes('Elysia'));
    assert.ok(appearance.associated_locations.some((l) => l.name === 'Citadel of Glass'));

    // Location dossier route
    const locReq = new Request(
      `http://localhost:3000/api/universes/${primaryUniverseId}/locations/${locCitadelId}`,
      { headers: { 'x-session-token': 'tok-usr-archivist-prime' } }
    );
    const locRes = await getLocationDetails(locReq, {
      params: Promise.resolve({ id: primaryUniverseId, locationId: locCitadelId }),
    });
    assert.strictEqual(locRes.status, 200);
    const locData = await locRes.json();
    assert.ok(locData.chapter_appearances, 'Location has chapter appearances list');
    assert.ok(locData.chapter_appearances.length > 0);
    const locApp = (locData.chapter_appearances as AppearanceItem[]).find((a) => a.chapter_id === chapId);
    assert.ok(locApp, 'Location appearance in Chapter 8 found');
    assert.ok(locApp.associated_characters.some((c) => c.name === 'Elysia'));
  });

  test('9. No external AI inference calls: local loopback isolation strictly enforced', () => {
    // Valid local loopback addresses
    assert.strictEqual(validateLocalRuntimeUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
    assert.strictEqual(validateLocalRuntimeUrl('http://localhost:11434'), 'http://localhost:11434');

    // Cloud, remote, or paid AI endpoints MUST throw an error
    assert.throws(() => validateLocalRuntimeUrl('https://api.openai.com/v1'), /Security boundary violation/);
    assert.throws(() => validateLocalRuntimeUrl('https://api.anthropic.com'), /Security boundary violation/);
    assert.throws(() => validateLocalRuntimeUrl('http://192.168.1.50:11434'), /Security boundary violation/);
    assert.throws(() => validateLocalRuntimeUrl('https://my-cloud-ollama.com'), /Security boundary violation/);
  });
});
