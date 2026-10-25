import crypto from 'crypto';
import { query } from '@/lib/db';
import {
  Chapter,
  Character,
  Location,
  UniverseEvent,
  Secret,
  ChapterEntityLink,
  EntityType,
  EntityRelationshipType,
  EntityLinkStatus,
  EntityLinkSource,
  EntityMentionPosition,
} from '@/lib/db/types';
import { checkOllamaStatus, queryLocalOllama } from '@/lib/ai/ollama';

export function computeEntityLinkFingerprint(
  entityType: string,
  entityId: string | null,
  entityName: string
): string {
  const normType = entityType.toLowerCase().trim();
  const normId = (entityId || '').trim();
  const normName = entityName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(`${normType}:${normId}:${normName}`).digest('hex');
}

export interface DetectedEntityCandidate {
  entityType: EntityType;
  entityId: string | null;
  characterId?: string | null;
  locationId?: string | null;
  eventId?: string | null;
  entityName: string;
  matchedAlias?: string | null;
  relationshipType: EntityRelationshipType;
  status: EntityLinkStatus;
  source: EntityLinkSource;
  confidence: number;
  mentionCount: number;
  passage: string;
  passageReference: string;
  positions: EntityMentionPosition[];
  authorNotes?: string | null;
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Finds all exact token match occurrences of a term within text, respecting
 * word boundaries, punctuation, apostrophes, and avoiding partial substring matches.
 */
export function findTermOccurrences(
  text: string,
  term: string,
  caseSensitive = false
): EntityMentionPosition[] {
  if (!text || !term || term.trim().length === 0) return [];
  const cleanTerm = term.trim();
  const escaped = escapeRegex(cleanTerm);

  // Use boundary that accounts for punctuation: not preceded or followed by alphanumeric
  const pattern = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, caseSensitive ? 'g' : 'gi');
  const positions: EntityMentionPosition[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    positions.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }

  return positions;
}

/**
 * Extracts a representative passage (e.g. 120-180 chars) surrounding the first match.
 */
function extractPassage(text: string, pos: EntityMentionPosition): { passage: string; passageReference: string } {
  const start = Math.max(0, pos.start - 60);
  const end = Math.min(text.length, pos.end + 80);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < text.length) snippet = `${snippet}...`;

  return {
    passage: snippet,
    passageReference: `Offset ${pos.start}-${pos.end}`,
  };
}

/**
 * Analyzes surrounding context of character mentions to determine if the character
 * actively appears in scene or is merely mentioned in passing.
 */
function classifyCharacterParticipation(
  text: string,
  positions: EntityMentionPosition[]
): EntityRelationshipType {
  // If mentioned 3 or more times, they are heavily involved in the chapter
  if (positions.length >= 3) {
    return 'appears';
  }

  // Active dialogue and physical action indicators
  const activeVerbsPattern = /(said|replied|asked|whispered|nodded|shouted|yelled|screamed|muttered|spoke|answered|exclaimed|turned|walked|stepped|drew|looked|stood|smiled|frowned|laughed|sighed|grasped|held|reached)\b/i;
  const quotePattern = /["“][^"”]{2,120}["”]/;

  for (const pos of positions) {
    // Check 80 characters before and after the mention
    const windowStart = Math.max(0, pos.start - 70);
    const windowEnd = Math.min(text.length, pos.end + 70);
    const window = text.slice(windowStart, windowEnd);

    if (activeVerbsPattern.test(window) || quotePattern.test(window)) {
      return 'appears';
    }
  }

  return 'mentioned';
}

/**
 * Analyzes location mentions to determine if the scene is set at this location
 * or if it's merely referenced.
 */
function classifyLocationParticipation(
  text: string,
  chapterTitle: string,
  positions: EntityMentionPosition[]
): EntityRelationshipType {
  // If mentioned in the chapter title, it explicitly sets the scene
  if (chapterTitle && positions.some((p) => chapterTitle.toLowerCase().includes(p.text.toLowerCase()))) {
    return 'setting';
  }

  // Active scene presence cues (avoid single preposition 'in' which matches 'in the woods far away')
  const settingPattern = /\b(deep within|within the|inside|entered|arrived at|reached|stood in|standing in|walked into|halls of|gates of|heart of|streets of|chamber of)\b/i;

  for (const pos of positions) {
    const windowStart = Math.max(0, pos.start - 50);
    const windowEnd = Math.min(text.length, pos.end + 40);
    const window = text.slice(windowStart, windowEnd);

    if (settingPattern.test(window)) {
      return 'setting';
    }
  }

  return positions.length >= 3 ? 'setting' : 'mentioned';
}

/**
 * Parse comma or newline separated aliases into unique non-empty tokens.
 */
export function parseAliases(aliasStr?: string | null): string[] {
  if (!aliasStr) return [];
  return aliasStr
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/**
 * Extract unregistered entity candidates (unknown characters and locations)
 * using deterministic linguistic patterns.
 */
export function extractUnregisteredEntities(
  text: string,
  knownCharNames: Set<string>,
  knownLocNames: Set<string>
): DetectedEntityCandidate[] {
  const candidates: DetectedEntityCandidate[] = [];
  const seenNames = new Set<string>();

  // 1. Titled names: "Lord X", "Lady Y", "Captain Z", "Arch-Mage W", etc.
  const titleRegex = /\b(Lord|Lady|Captain|Commander|Archon|Baron|Count|Countess|Duke|Duchess|King|Queen|Prince|Princess|Master|Elder|General|Archivist)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match: RegExpExecArray | null = null;

  while ((match = titleRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const personName = match[2];
    const norm = personName.toLowerCase();

    // Skip common nouns or known names
    if (
      !knownCharNames.has(norm) &&
      !knownLocNames.has(norm) &&
      !seenNames.has(norm) &&
      personName.length > 2 &&
      !['Day', 'Night', 'Light', 'Darkness', 'Time', 'Silence', 'Death', 'Life'].includes(personName)
    ) {
      seenNames.add(norm);
      const positions = findTermOccurrences(text, fullMatch);
      if (positions.length > 0) {
        const { passage, passageReference } = extractPassage(text, positions[0]);
        candidates.push({
          entityType: 'unknown',
          entityId: null,
          entityName: fullMatch,
          matchedAlias: personName,
          relationshipType: 'appears',
          status: 'needs_review',
          source: 'deterministic',
          confidence: 0.75,
          mentionCount: positions.length,
          passage,
          passageReference,
          positions,
          authorNotes: `Potential new character candidate with title "${match[1]}".`,
        });
      }
    }
  }

  // 2. Named locations: "City of X", "Fortress of Y", "Temple of Z", "Spire of W"
  const locRegex = /\b(City|Fortress|Temple|Spire|Kingdom|Isle|Sea|Forest|Valley|Citadel|Gate)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  while ((match = locRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const locName = match[2];
    const norm = fullMatch.toLowerCase();

    if (
      !knownLocNames.has(norm) &&
      !knownLocNames.has(locName.toLowerCase()) &&
      !seenNames.has(norm) &&
      locName.length > 2
    ) {
      seenNames.add(norm);
      const positions = findTermOccurrences(text, fullMatch);
      if (positions.length > 0) {
        const { passage, passageReference } = extractPassage(text, positions[0]);
        candidates.push({
          entityType: 'unknown',
          entityId: null,
          entityName: fullMatch,
          matchedAlias: locName,
          relationshipType: 'setting',
          status: 'needs_review',
          source: 'deterministic',
          confidence: 0.75,
          mentionCount: positions.length,
          passage,
          passageReference,
          positions,
          authorNotes: `Potential new location candidate indicated by structure "${match[1]} of".`,
        });
      }
    }
  }

  return candidates;
}

/**
 * Core Deterministic Entity Detection Engine
 * Inspects chapter text against universe characters, locations, events, secrets.
 */
export async function detectEntitiesInChapter(params: {
  chapter: Chapter;
  universeId: string;
  characters: Character[];
  locations: Location[];
  events: UniverseEvent[];
  secrets: Secret[];
  useLocalAi?: boolean;
}): Promise<DetectedEntityCandidate[]> {
  const { chapter, characters, locations, events, secrets, useLocalAi = true } = params;
  const content = chapter.content || '';
  const title = chapter.title || '';
  const fullText = `${title}\n\n${content}`;

  if (!fullText.trim()) return [];

  const candidates: DetectedEntityCandidate[] = [];
  const knownCharNames = new Set<string>();
  const knownLocNames = new Set<string>();

  // 1. MATCH CHARACTERS
  // Identify potential name collisions (e.g. shared surname "Vance")
  const nameOccurrencesCount = new Map<string, number>();
  for (const c of characters) {
    knownCharNames.add(c.name.toLowerCase());
    const parts = c.name.split(/\s+/).filter((p) => p.length >= 3);
    for (const p of parts) {
      const pNorm = p.toLowerCase();
      nameOccurrencesCount.set(pNorm, (nameOccurrencesCount.get(pNorm) || 0) + 1);
    }
  }

  for (const char of characters) {
    const termVariants: { term: string; isAlias: boolean }[] = [{ term: char.name, isAlias: false }];

    if (char.epithet && char.epithet.trim().length >= 3) {
      termVariants.push({ term: char.epithet.trim(), isAlias: true });
    }

    const explicitAliases = parseAliases(char.aliases);
    for (const al of explicitAliases) {
      if (!termVariants.some((t) => t.term.toLowerCase() === al.toLowerCase())) {
        termVariants.push({ term: al, isAlias: true });
      }
    }

    // Support single distinctive name parts (e.g. "Lyra" or "Aurelius") if not shared by another character
    const nameParts = char.name.split(/\s+/).filter((p) => p.length >= 3 && !['Lord', 'Lady', 'Grand', 'Commander', 'High', 'Archivist', 'The', 'Sir'].includes(p));
    for (const part of nameParts) {
      const partNorm = part.toLowerCase();
      const occurrences = nameOccurrencesCount.get(partNorm) || 0;
      if (occurrences === 1 && !termVariants.some((t) => t.term.toLowerCase() === partNorm)) {
        termVariants.push({ term: part, isAlias: true });
      }
    }

    // Check occurrences of each variant
    const allPositions: EntityMentionPosition[] = [];
    let bestMatchedAlias: string | null = null;
    let isAmbiguous = false;

    for (const { term } of termVariants) {
      const occs = findTermOccurrences(fullText, term);
      if (occs.length > 0) {
        if (!bestMatchedAlias) bestMatchedAlias = term;
        for (const o of occs) {
          // Avoid overlapping positions
          if (!allPositions.some((p) => p.start === o.start && p.end === o.end)) {
            allPositions.push(o);
          }
        }
      }
    }

    // Check if a shared surname was matched alone
    for (const part of nameParts) {
      const partNorm = part.toLowerCase();
      if ((nameOccurrencesCount.get(partNorm) || 0) > 1) {
        const occs = findTermOccurrences(fullText, part);
        if (occs.length > 0 && allPositions.length === 0) {
          // Only shared surname was found
          isAmbiguous = true;
          bestMatchedAlias = part;
          allPositions.push(...occs);
        }
      }
    }

    if (allPositions.length > 0) {
      // Sort positions by start
      allPositions.sort((a, b) => a.start - b.start);
      const relType = classifyCharacterParticipation(fullText, allPositions);
      const { passage, passageReference } = extractPassage(fullText, allPositions[0]);

      candidates.push({
        entityType: 'character',
        entityId: char.id,
        characterId: char.id,
        entityName: char.name,
        matchedAlias: bestMatchedAlias,
        relationshipType: relType,
        status: isAmbiguous ? 'needs_review' : 'detected',
        source: 'deterministic',
        confidence: isAmbiguous ? 0.65 : 1.0,
        mentionCount: allPositions.length,
        passage,
        passageReference,
        positions: allPositions,
        authorNotes: isAmbiguous
          ? `Ambiguous name mention "${bestMatchedAlias}" may refer to multiple characters.`
          : undefined,
      });
    }
  }

  // 2. MATCH LOCATIONS
  for (const loc of locations) {
    knownLocNames.add(loc.name.toLowerCase());
    const termVariants: { term: string; isAlias: boolean }[] = [{ term: loc.name, isAlias: false }];

    const explicitAliases = parseAliases(loc.aliases);
    for (const al of explicitAliases) {
      if (!termVariants.some((t) => t.term.toLowerCase() === al.toLowerCase())) {
        termVariants.push({ term: al, isAlias: true });
      }
    }

    const allPositions: EntityMentionPosition[] = [];
    let bestMatchedAlias: string | null = null;

    for (const { term } of termVariants) {
      const occs = findTermOccurrences(fullText, term);
      if (occs.length > 0) {
        if (!bestMatchedAlias) bestMatchedAlias = term;
        for (const o of occs) {
          if (!allPositions.some((p) => p.start === o.start && p.end === o.end)) {
            allPositions.push(o);
          }
        }
      }
    }

    if (allPositions.length > 0) {
      allPositions.sort((a, b) => a.start - b.start);
      const relType = classifyLocationParticipation(fullText, title, allPositions);
      const { passage, passageReference } = extractPassage(fullText, allPositions[0]);

      candidates.push({
        entityType: 'location',
        entityId: loc.id,
        locationId: loc.id,
        entityName: loc.name,
        matchedAlias: bestMatchedAlias,
        relationshipType: relType,
        status: 'detected',
        source: 'deterministic',
        confidence: 1.0,
        mentionCount: allPositions.length,
        passage,
        passageReference,
        positions: allPositions,
      });
    }
  }

  // 3. MATCH EVENTS
  for (const ev of events) {
    if (ev.title && ev.title.trim().length >= 4) {
      const occs = findTermOccurrences(fullText, ev.title.trim());
      if (occs.length > 0) {
        occs.sort((a, b) => a.start - b.start);
        const { passage, passageReference } = extractPassage(fullText, occs[0]);

        candidates.push({
          entityType: 'event',
          entityId: ev.id,
          eventId: ev.id,
          entityName: ev.title,
          matchedAlias: ev.title,
          relationshipType: 'referenced',
          status: 'detected',
          source: 'deterministic',
          confidence: 0.95,
          mentionCount: occs.length,
          passage,
          passageReference,
          positions: occs,
        });
      }
    }
  }

  // 4. MATCH SECRETS / LORE OBJECTS
  for (const sec of secrets) {
    if (sec.title && sec.title.trim().length >= 4) {
      const occs = findTermOccurrences(fullText, sec.title.trim());
      if (occs.length > 0) {
        occs.sort((a, b) => a.start - b.start);
        const { passage, passageReference } = extractPassage(fullText, occs[0]);

        candidates.push({
          entityType: 'lore_object',
          entityId: sec.id,
          entityName: sec.title,
          matchedAlias: sec.title,
          relationshipType: 'referenced',
          status: 'detected',
          source: 'deterministic',
          confidence: 0.95,
          mentionCount: occs.length,
          passage,
          passageReference,
          positions: occs,
        });
      }
    }
  }

  // 5. EXTRACT UNREGISTERED CANDIDATES (Unknown characters & locations)
  const unregistered = extractUnregisteredEntities(fullText, knownCharNames, knownLocNames);
  candidates.push(...unregistered);

  // 6. OPTIONAL LOCAL OLLAMA CONTEXTUAL ANALYSIS (only if available, loopback only)
  if (useLocalAi && content.length > 20) {
    try {
      const runtimeStatus = await checkOllamaStatus();
      if (runtimeStatus.isAvailable && runtimeStatus.modelAvailable) {
        const sysPrompt = `You are an entity extraction assistant for fantasy and sci-fi fiction manuscripts.
Extract only entities present in the manuscript text that might not already be tracked.
Respond strictly in JSON:
{
  "entities": [
    {
      "name": "Exact Name",
      "type": "character" | "location" | "lore_object",
      "relationship": "appears" | "mentioned" | "setting",
      "passage": "Exact quote from text",
      "confidence": 0.8
    }
  ]
}`;
        const userPrompt = `Chapter Title: ${title}\nManuscript:\n${content.slice(0, 3000)}\n\nIdentify key entities.`;
        const { rawOutput } = await queryLocalOllama(userPrompt, sysPrompt);
        if (rawOutput) {
          try {
            const parsed = JSON.parse(rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
            const list = Array.isArray(parsed?.entities) ? parsed.entities : [];
            for (const item of list) {
              const name = typeof item.name === 'string' ? item.name.trim() : '';
              if (!name || name.length < 3) continue;
              const norm = name.toLowerCase();
              if (knownCharNames.has(norm) || knownLocNames.has(norm) || candidates.some((c) => c.entityName.toLowerCase() === norm)) {
                continue;
              }
              const occs = findTermOccurrences(fullText, name);
              if (occs.length > 0) {
                const { passage, passageReference } = extractPassage(fullText, occs[0]);
                candidates.push({
                  entityType: 'unknown',
                  entityId: null,
                  entityName: name,
                  matchedAlias: name,
                  relationshipType: item.relationship === 'setting' ? 'setting' : (item.relationship === 'appears' ? 'appears' : 'mentioned'),
                  status: 'needs_review',
                  source: 'local_ai',
                  confidence: typeof item.confidence === 'number' ? Math.min(0.9, item.confidence) : 0.75,
                  mentionCount: occs.length,
                  passage,
                  passageReference,
                  positions: occs,
                  authorNotes: 'Candidate identified via local AI context interpretation.',
                });
              }
            }
          } catch {
            // Safe JSON parse ignore
          }
        }
      }
    } catch {
      // Local AI offline or failed; deterministic results remain intact
    }
  }

  return candidates;
}

/**
 * End-to-End Chapter Entity Tracking Processing
 * Fetches universe entities, computes detections, reconciles with existing links,
 * preserves author-confirmed and manual links, and idempotently updates chapter_entity_links.
 */
export async function processChapterEntityTracking(params: {
  chapterId: string;
  universeId: string;
  storyId?: string | null;
  manuscriptContent?: string | null;
  useOllama?: boolean;
  forceRecompute?: boolean;
}): Promise<{
  success: boolean;
  links: ChapterEntityLink[];
  summary: {
    total: number;
    charactersCount: number;
    locationsCount: number;
    eventsCount: number;
    unknownCount: number;
    confirmedCount: number;
    detectedCount: number;
    needsReviewCount: number;
  };
}> {
  const { chapterId, universeId, storyId } = params;

  // 1. Fetch chapter
  const chapRes = await query<Chapter>('SELECT * FROM chapters WHERE id = $1', [chapterId]);
  if (chapRes.rows.length === 0) {
    throw new Error('Chapter not found for entity tracking');
  }
  const chapter = chapRes.rows[0];
  if (params.manuscriptContent !== undefined && params.manuscriptContent !== null) {
    chapter.content = params.manuscriptContent;
  }

  // 2. Fetch universe entities
  const [charsRes, locsRes, eventsRes, secretsRes] = await Promise.all([
    query<Character>('SELECT * FROM characters WHERE universe_id = $1 ORDER BY name ASC', [universeId]),
    query<Location>('SELECT * FROM locations WHERE universe_id = $1 ORDER BY name ASC', [universeId]),
    query<UniverseEvent>('SELECT * FROM events WHERE universe_id = $1 ORDER BY timestamp_year ASC', [universeId]),
    query<Secret>('SELECT * FROM secrets WHERE universe_id = $1 ORDER BY created_at ASC', [universeId]),
  ]);

  // 3. Detect candidate entities
  const candidates = await detectEntitiesInChapter({
    chapter,
    universeId,
    characters: charsRes.rows,
    locations: locsRes.rows,
    events: eventsRes.rows,
    secrets: secretsRes.rows,
    useLocalAi: false, // Default to deterministic for standard pipeline; local AI can be triggered on demand
  });

  // 4. Fetch existing links for this chapter
  const existingRes = await query<ChapterEntityLink>(
    'SELECT * FROM chapter_entity_links WHERE chapter_id = $1',
    [chapterId]
  );
  const existingMap = new Map<string, ChapterEntityLink>();
  for (const link of existingRes.rows) {
    existingMap.set(link.fingerprint, link);
  }

  const detectedFingerprints = new Set<string>();
  const finalLinks: ChapterEntityLink[] = [];

  // 5. Upsert detected candidates idempotently
  for (const cand of candidates) {
    const fingerprint = computeEntityLinkFingerprint(cand.entityType, cand.entityId, cand.entityName);
    detectedFingerprints.add(fingerprint);

    const existing = existingMap.get(fingerprint);

    if (!existing) {
      // New link
      const linkId = `cel-${crypto.randomUUID().slice(0, 12)}`;
      const positionsJson = JSON.stringify(cand.positions);

      await query(
        `INSERT INTO chapter_entity_links (
          id, chapter_id, universe_id, story_id, character_id, location_id, event_id,
          entity_type, entity_id, entity_name, matched_alias, relationship_type,
          status, source, confidence, mention_count, passage, passage_reference,
          positions_json, author_notes, is_stale, fingerprint, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, false, $21, NOW(), NOW()
        )`,
        [
          linkId,
          chapterId,
          universeId,
          storyId || chapter.story_id || null,
          cand.characterId || null,
          cand.locationId || null,
          cand.eventId || null,
          cand.entityType,
          cand.entityId,
          cand.entityName,
          cand.matchedAlias || null,
          cand.relationshipType,
          cand.status,
          cand.source,
          cand.confidence,
          cand.mentionCount,
          cand.passage,
          cand.passageReference,
          positionsJson,
          cand.authorNotes || null,
          fingerprint,
        ]
      );

      finalLinks.push({
        id: linkId,
        chapter_id: chapterId,
        universe_id: universeId,
        story_id: storyId || chapter.story_id || null,
        character_id: cand.characterId || null,
        location_id: cand.locationId || null,
        event_id: cand.eventId || null,
        entity_type: cand.entityType,
        entity_id: cand.entityId,
        entity_name: cand.entityName,
        matched_alias: cand.matchedAlias || null,
        relationship_type: cand.relationshipType,
        status: cand.status,
        source: cand.source,
        confidence: cand.confidence,
        mention_count: cand.mentionCount,
        passage: cand.passage,
        passage_reference: cand.passageReference,
        positions_json: positionsJson,
        positions: cand.positions,
        author_notes: cand.authorNotes || null,
        is_stale: false,
        fingerprint,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      // Existing link: Preserve author confirmation / intentional edits
      const isAuthorModified =
        existing.status === 'confirmed' ||
        existing.status === 'dismissed' ||
        existing.source === 'author_confirmed' ||
        existing.source === 'manual';

      const preservedStatus = isAuthorModified ? existing.status : cand.status;
      const preservedSource = isAuthorModified ? existing.source : cand.source;
      const preservedRelType = isAuthorModified ? existing.relationship_type : cand.relationshipType;
      const positionsJson = JSON.stringify(cand.positions);

      await query(
        `UPDATE chapter_entity_links
         SET status = $1,
             source = $2,
             relationship_type = $3,
             matched_alias = $4,
             mention_count = $5,
             passage = $6,
             passage_reference = $7,
             positions_json = $8,
             confidence = $9,
             is_stale = false,
             updated_at = NOW()
         WHERE id = $10`,
        [
          preservedStatus,
          preservedSource,
          preservedRelType,
          cand.matchedAlias || existing.matched_alias,
          cand.mentionCount,
          cand.passage,
          cand.passageReference,
          positionsJson,
          cand.confidence,
          existing.id,
        ]
      );

      finalLinks.push({
        ...existing,
        status: preservedStatus,
        source: preservedSource,
        relationship_type: preservedRelType,
        matched_alias: cand.matchedAlias || existing.matched_alias,
        mention_count: cand.mentionCount,
        passage: cand.passage,
        passage_reference: cand.passageReference,
        positions_json: positionsJson,
        positions: cand.positions,
        is_stale: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 6. Reconcile links that were NOT detected in the new text
  for (const existing of existingRes.rows) {
    if (!detectedFingerprints.has(existing.fingerprint)) {
      if (existing.status === 'confirmed' || existing.source === 'manual' || existing.source === 'author_confirmed') {
        // Author explicitly established this link; mark is_stale = true to signal text changed, but DO NOT delete!
        await query('UPDATE chapter_entity_links SET is_stale = true, updated_at = NOW() WHERE id = $1', [existing.id]);
        finalLinks.push({
          ...existing,
          is_stale: true,
        });
      } else {
        // Obsolete automatic link: remove it safely
        await query('DELETE FROM chapter_entity_links WHERE id = $1', [existing.id]);
      }
    }
  }

  const summary = {
    total: finalLinks.length,
    charactersCount: finalLinks.filter((l) => l.entity_type === 'character').length,
    locationsCount: finalLinks.filter((l) => l.entity_type === 'location').length,
    eventsCount: finalLinks.filter((l) => l.entity_type === 'event').length,
    unknownCount: finalLinks.filter((l) => l.entity_type === 'unknown').length,
    confirmedCount: finalLinks.filter((l) => l.status === 'confirmed').length,
    detectedCount: finalLinks.filter((l) => l.status === 'detected').length,
    needsReviewCount: finalLinks.filter((l) => l.status === 'needs_review').length,
  };

  return {
    success: true,
    links: finalLinks,
    summary,
  };
}
