import { query, transaction } from './index';
import { SYSTEM_USER_ID } from '../auth/session';

export const EXEMPLAR_UNIVERSE_ID = 'univ-demo-aethelgard';

/**
 * Idempotently seeds the exemplar demo universe (Aethelgard) into the database
 * along with characters, locations, chapters, events, participants, dependencies,
 * relationships, secrets, and knowledge.
 */
export async function ensureDefaultUniverses(): Promise<void> {
  // Check if exemplar universe already exists
  const existing = await query(
    'SELECT id FROM universes WHERE id = $1',
    [EXEMPLAR_UNIVERSE_ID]
  );

  if (existing.rows.length > 0) {
    // Ensure ownership is assigned to system user and marked as example template
    await query(
      `UPDATE universes SET user_id = $1, is_example = true WHERE id = $2`,
      [SYSTEM_USER_ID, EXEMPLAR_UNIVERSE_ID]
    );

    // Ensure demo chapters have manuscript content if previously empty
    await query(`
      UPDATE chapters SET 
        content = CASE 
          WHEN id = 'chap-demo-1' AND content = '' THEN 'The celestial needles within the Obsidian Spire trembled upon their pedestals, chiming with the dissonant hum of fracturing timelines. Grand Archivist Vaelen adjusted his ocular lenses, watching the silver leylines pulse against the black marble vault.\n\n"The resonance is shifting," whispered Lady Lyra, her fingers tracing the star-charts illuminated upon the glass floor. "If the Astris anchor collapses, the entire eastern quadrant will slip beyond the veil."\n\nVaelen did not answer immediately. In his chest, the tethered fragment of the Astrolabe burned cold—a silent reminder of the sacrifice demanded when mortals dare measure eternity. Commander Kaelen stood vigil by the bronze doorway, his halberd gleaming under the astral glow. Across the chamber, shadows pooled beneath the dais where Silas the Exiled Scribe observed in unsettling quietude.'
          WHEN id = 'chap-demo-2' AND content = '' THEN 'Salt and shattered glass coated the lower embankments of Astris. Commander Kaelen wiped black bile from his visor as the sea broke against the seawall. The Abyssal Tide was no natural surge; it carried the dead memories of lost centuries, suffocating the incandescent lanterns of the scriptorium.\n\nLady Lyra called out from the upper balustrade, her voice carried away by the roar of churning water. "The seals are uncoupling! Vaelen has entered the inner sanctum alone!"\n\nKaelen tightened his grip upon his spear. He knew the cost of what Vaelen intended. To rebind a collapsing quadrant required feeding a living soul into the Astrolabe''s chronological cogs.'
          WHEN id = 'chap-demo-3' AND content = '' THEN 'Deep beneath the submerged foundations of Astris, where no starlight had touched stone for five centuries, Silas knelt before the Void Gate. The obsidian door bore no keyhole, only twelve concentric circles inscribed in celestial glyphs.\n\nFrom his cloak, Silas withdrew the stolen silver prism. It pulsed in cadence with his own heartbeat. "They call it heresy," he murmured to the cold waters licking his boots. "Yet what is heresy when the stars themselves have forgotten our names?"'
          ELSE content
        END,
        word_count = CASE 
          WHEN id = 'chap-demo-1' AND (word_count = 0 OR word_count IS NULL) THEN 142
          WHEN id = 'chap-demo-2' AND (word_count = 0 OR word_count IS NULL) THEN 110
          WHEN id = 'chap-demo-3' AND (word_count = 0 OR word_count IS NULL) THEN 81
          ELSE word_count
        END
      WHERE universe_id = $1
    `, [EXEMPLAR_UNIVERSE_ID]);

    // Ensure demo story exists and chapters are linked
    await query(`
      INSERT INTO stories (id, user_id, title, description, is_example, status)
      VALUES ($1, $2, $3, $4, true, 'draft')
      ON CONFLICT (id) DO NOTHING
    `, [
      'story-demo-aethelgard',
      SYSTEM_USER_ID,
      'The Obsidian Spire: Chronicles of Astris',
      'The epic chronicle of Grand Archivist Vaelen and the fracture of the celestial leylines.',
    ]);

    await query(`
      INSERT INTO story_universes (story_id, universe_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, ['story-demo-aethelgard', EXEMPLAR_UNIVERSE_ID]);

    await query(`
      UPDATE chapters SET story_id = 'story-demo-aethelgard'
      WHERE universe_id = $1 AND (story_id IS NULL OR story_id = '')
    `, [EXEMPLAR_UNIVERSE_ID]);
    return;
  }

  await transaction(async (tx) => {
    // 1. Create exemplar universe
    await tx.query(
      `INSERT INTO universes (id, user_id, title, description, cover_url, is_example, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        EXEMPLAR_UNIVERSE_ID,
        SYSTEM_USER_ID,
        'Aethelgard: The Astral Shards',
        'A fractured celestial sphere held together by ancient golden leylines and dying starfire.',
        '/covers/citadel.svg',
      ]
    );

    // 2. Locations
    const locations = [
      {
        id: 'loc-demo-astris',
        name: 'The Sunken Citadel of Astris',
        realm: 'Celestial Firmament',
        description: 'An ancient obsidian city submerged beneath the glowing silver sea of the Astral Plane.',
        coordinates_x: 240,
        coordinates_y: 580,
      },
      {
        id: 'loc-demo-spire',
        name: 'The Obsidian Spire of Chronos',
        realm: 'Astral Expanse',
        description: 'A monolithic spire housing the great Astrolabe of Severed Timelines.',
        coordinates_x: 520,
        coordinates_y: 310,
      },
      {
        id: 'loc-demo-sanctum',
        name: 'The Scriptorium Sanctum',
        realm: 'Inner Sanctum',
        description: 'The secret library where the High Scribes log every paradox.',
        coordinates_x: 180,
        coordinates_y: 190,
      },
    ];

    for (const loc of locations) {
      await tx.query(
        `INSERT INTO locations (id, universe_id, name, realm, description, coordinates_x, coordinates_y)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [loc.id, EXEMPLAR_UNIVERSE_ID, loc.name, loc.realm, loc.description, loc.coordinates_x, loc.coordinates_y]
      );
    }

    // 3. Chapters
    const chapters = [
      {
        id: 'chap-demo-1',
        title: 'The Gathering of Starlight',
        sequence_number: 1,
        summary: 'Archivists convene at the Obsidian Spire as the leylines begin to oscillate.',
        content: `The celestial needles within the Obsidian Spire trembled upon their pedestals, chiming with the dissonant hum of fracturing timelines. Grand Archivist Vaelen adjusted his ocular lenses, watching the silver leylines pulse against the black marble vault.

"The resonance is shifting," whispered Lady Lyra, her fingers tracing the star-charts illuminated upon the glass floor. "If the Astris anchor collapses, the entire eastern quadrant will slip beyond the veil."

Vaelen did not answer immediately. In his chest, the tethered fragment of the Astrolabe burned cold—a silent reminder of the sacrifice demanded when mortals dare measure eternity. Commander Kaelen stood vigil by the bronze doorway, his halberd gleaming under the astral glow. Across the chamber, shadows pooled beneath the dais where Silas the Exiled Scribe observed in unsettling quietude.`,
        word_count: 142,
        version: 1,
        status: 'canonized' as const,
      },
      {
        id: 'chap-demo-2',
        title: 'The Fracture of Astris',
        sequence_number: 2,
        summary: 'Commander Kaelen leads the defense as the Abyssal Tide reaches the lower archives.',
        content: `Salt and shattered glass coated the lower embankments of Astris. Commander Kaelen wiped black bile from his visor as the sea broke against the seawall. The Abyssal Tide was no natural surge; it carried the dead memories of lost centuries, suffocating the incandescent lanterns of the scriptorium.

Lady Lyra called out from the upper balustrade, her voice carried away by the roar of churning water. "The seals are uncoupling! Vaelen has entered the inner sanctum alone!"

Kaelen tightened his grip upon his spear. He knew the cost of what Vaelen intended. To rebind a collapsing quadrant required feeding a living soul into the Astrolabe's chronological cogs.`,
        word_count: 110,
        version: 1,
        status: 'draft' as const,
      },
      {
        id: 'chap-demo-3',
        title: 'Shadows of the Void Gate',
        sequence_number: 3,
        summary: 'Silas unseals the forbidden gateway beneath the submerged vaults.',
        content: `Deep beneath the submerged foundations of Astris, where no starlight had touched stone for five centuries, Silas knelt before the Void Gate. The obsidian door bore no keyhole, only twelve concentric circles inscribed in celestial glyphs.

From his cloak, Silas withdrew the stolen silver prism. It pulsed in cadence with his own heartbeat. "They call it heresy," he murmured to the cold waters licking his boots. "Yet what is heresy when the stars themselves have forgotten our names?"`,
        word_count: 81,
        version: 1,
        status: 'draft' as const,
      },
    ];

    // 3. Seed exemplar story
    await tx.query(
      `INSERT INTO stories (id, user_id, title, description, is_example, status)
       VALUES ($1, $2, $3, $4, true, 'draft')
       ON CONFLICT (id) DO NOTHING`,
      [
        'story-demo-aethelgard',
        SYSTEM_USER_ID,
        'The Obsidian Spire: Chronicles of Astris',
        'The epic chronicle of Grand Archivist Vaelen and the fracture of the celestial leylines.',
      ]
    );

    await tx.query(
      `INSERT INTO story_universes (story_id, universe_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      ['story-demo-aethelgard', EXEMPLAR_UNIVERSE_ID]
    );

    for (const ch of chapters) {
      await tx.query(
        `INSERT INTO chapters (id, universe_id, story_id, title, sequence_number, summary, content, word_count, version, status)
         VALUES ($1, $2, 'story-demo-aethelgard', $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           story_id = COALESCE(chapters.story_id, EXCLUDED.story_id),
           content = CASE WHEN chapters.content = '' THEN EXCLUDED.content ELSE chapters.content END,
           word_count = CASE WHEN chapters.word_count = 0 THEN EXCLUDED.word_count ELSE chapters.word_count END`,
        [ch.id, EXEMPLAR_UNIVERSE_ID, ch.title, ch.sequence_number, ch.summary, ch.content, ch.word_count, ch.version, ch.status]
      );
    }

    // 4. Characters
    const characters = [
      {
        id: 'char-demo-vaelen',
        name: 'Grand Archivist Vaelen',
        epithet: 'Keeper of the Obsidian Needle',
        bio: 'High Scribe who mapped the shattered constellations and bound his soul to the Astrolabe.',
        birth_year: 280,
        death_year: null,
        death_confirmed: false,
        status: 'alive',
      },
      {
        id: 'char-demo-lyra',
        name: 'Lady Lyra of the Glass Spire',
        epithet: 'The Starlight Navigator',
        bio: 'Cartographer gifted with foresight, calculating safe voyages across the void.',
        birth_year: 295,
        death_year: null,
        death_confirmed: false,
        status: 'alive',
      },
      {
        id: 'char-demo-kaelen',
        name: 'Commander Kaelen Vance',
        epithet: 'Shield of the Astral Sea',
        bio: 'Commander of the Sunken Citadel garrison who perished holding the breach against the Void Tides.',
        birth_year: 270,
        death_year: 340,
        death_confirmed: true,
        status: 'deceased',
      },
      {
        id: 'char-demo-silas',
        name: 'Silas the Shadow Weaver',
        epithet: 'Apostate of the Synod',
        bio: 'A renegade scholar who breached the forbidden wards beneath Astris.',
        birth_year: 285,
        death_year: null,
        death_confirmed: false,
        status: 'alive',
      },
    ];

    for (const c of characters) {
      await tx.query(
        `INSERT INTO characters (id, universe_id, name, epithet, bio, birth_year, death_year, death_confirmed, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, EXEMPLAR_UNIVERSE_ID, c.name, c.epithet, c.bio, c.birth_year, c.death_year, c.death_confirmed, c.status]
      );
    }

    // 5. Events
    const events = [
      {
        id: 'evt-demo-conclave',
        title: 'The Astral Conclave at the Spire',
        description: 'Vaelen and Lyra align the astrological needles and predict the first temporal tear.',
        sequence_number: 1,
        timestamp_year: 310,
        location_id: 'loc-demo-spire',
        chapter_id: 'chap-demo-1',
        is_death_event: false,
      },
      {
        id: 'evt-demo-tide-breach',
        title: 'The Breach of the Submerged Vaults',
        description: 'Void tides penetrate the lower vaults of Astris; Silas begins forbidden rituals.',
        sequence_number: 2,
        timestamp_year: 335,
        location_id: 'loc-demo-astris',
        chapter_id: 'chap-demo-2',
        is_death_event: false,
      },
      {
        id: 'evt-demo-kaelen-fall',
        title: 'The Last Stand of Commander Kaelen',
        description: 'Commander Kaelen falls while sealing the primary vault gates against the tide.',
        sequence_number: 3,
        timestamp_year: 340,
        location_id: 'loc-demo-astris',
        chapter_id: 'chap-demo-2',
        is_death_event: true,
      },
    ];

    for (const ev of events) {
      await tx.query(
        `INSERT INTO events (id, universe_id, title, description, sequence_number, timestamp_year, location_id, chapter_id, is_death_event)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [ev.id, EXEMPLAR_UNIVERSE_ID, ev.title, ev.description, ev.sequence_number, ev.timestamp_year, ev.location_id, ev.chapter_id, ev.is_death_event]
      );
    }

    // 6. Event Participants
    const participants = [
      { id: 'part-demo-1', event_id: 'evt-demo-conclave', character_id: 'char-demo-vaelen', role: 'Conclave Leader' },
      { id: 'part-demo-2', event_id: 'evt-demo-conclave', character_id: 'char-demo-lyra', role: 'Chief Navigator' },
      { id: 'part-demo-3', event_id: 'evt-demo-tide-breach', character_id: 'char-demo-kaelen', role: 'Garrison Commander' },
      { id: 'part-demo-4', event_id: 'evt-demo-tide-breach', character_id: 'char-demo-silas', role: 'Instigator' },
      { id: 'part-demo-5', event_id: 'evt-demo-kaelen-fall', character_id: 'char-demo-kaelen', role: 'Fallen Defender' },
    ];

    for (const p of participants) {
      await tx.query(
        `INSERT INTO event_participants (id, event_id, character_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.event_id, p.character_id, p.role]
      );
    }

    // 7. Event Dependencies
    const dependencies = [
      { id: 'dep-demo-1', event_id: 'evt-demo-tide-breach', predecessor_event_id: 'evt-demo-conclave', dependency_type: 'requires_predecessor' },
      { id: 'dep-demo-2', event_id: 'evt-demo-kaelen-fall', predecessor_event_id: 'evt-demo-tide-breach', dependency_type: 'requires_predecessor' },
    ];

    for (const d of dependencies) {
      await tx.query(
        `INSERT INTO event_dependencies (id, event_id, predecessor_event_id, dependency_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [d.id, d.event_id, d.predecessor_event_id, d.dependency_type]
      );
    }

    // 8. Relationships
    const relationships = [
      {
        id: 'rel-demo-1',
        source_character_id: 'char-demo-vaelen',
        target_character_id: 'char-demo-lyra',
        relationship_type: 'mentor_of',
        intensity: 8,
        notes: 'Instructed Lyra in the celestial mathematics of the Astral Spheres.',
      },
      {
        id: 'rel-demo-2',
        source_character_id: 'char-demo-lyra',
        target_character_id: 'char-demo-vaelen',
        relationship_type: 'allied_with',
        intensity: 7,
        notes: 'Loyal confidante and archivist second-in-command.',
      },
      {
        id: 'rel-demo-3',
        source_character_id: 'char-demo-silas',
        target_character_id: 'char-demo-kaelen',
        relationship_type: 'sworn_enemy_of',
        intensity: 9,
        notes: 'Clashed bitterly during the defense of the lower vaults.',
      },
    ];

    for (const r of relationships) {
      await tx.query(
        `INSERT INTO relationships (id, universe_id, source_character_id, target_character_id, relationship_type, intensity, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, EXEMPLAR_UNIVERSE_ID, r.source_character_id, r.target_character_id, r.relationship_type, r.intensity, r.notes]
      );
    }

    // 9. Secrets
    const secrets = [
      {
        id: 'sec-demo-astrolabe',
        title: 'The Astrolabe of Severed Timelines',
        content: 'An ancient relic that bends causality, forged by the first Arch-Scribe before the shattering.',
        severity: 'cosmic',
      },
      {
        id: 'sec-demo-void-gate',
        title: 'The Unsealed Void Gate',
        content: 'A subterranean aperture beneath Astris that bleeds anti-matter starfire into the leylines.',
        severity: 'forbidden',
      },
    ];

    for (const s of secrets) {
      await tx.query(
        `INSERT INTO secrets (id, universe_id, title, content, severity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, EXEMPLAR_UNIVERSE_ID, s.title, s.content, s.severity]
      );
    }

    // 10. Character Secrets (Knowledge)
    const knowledge = [
      {
        id: 'csec-demo-1',
        character_id: 'char-demo-vaelen',
        secret_id: 'sec-demo-astrolabe',
        learned_year: 305,
        learned_at_event_id: null,
        notes: 'Discovered during the initial calibration of the needle.',
      },
      {
        id: 'csec-demo-2',
        character_id: 'char-demo-lyra',
        secret_id: 'sec-demo-astrolabe',
        learned_year: 312,
        learned_at_event_id: 'evt-demo-conclave',
        notes: 'Revealed to Lyra by Vaelen following the conclave.',
      },
      {
        id: 'csec-demo-3',
        character_id: 'char-demo-silas',
        secret_id: 'sec-demo-void-gate',
        learned_year: 320,
        learned_at_event_id: null,
        notes: 'Found in the forbidden grimoires of the sunken archives.',
      },
    ];

    for (const k of knowledge) {
      await tx.query(
        `INSERT INTO character_secrets (id, character_id, secret_id, learned_year, learned_at_event_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [k.id, k.character_id, k.secret_id, k.learned_year, k.learned_at_event_id, k.notes]
      );
    }
  });
}
