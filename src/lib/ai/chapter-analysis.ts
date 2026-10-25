import crypto from 'crypto';
import { query } from '@/lib/db';
import {
  Chapter,
  Character,
  Location,
  UniverseEvent,
  Secret,
  CharacterSecret,
  ChapterAnalysisFinding,
} from '@/lib/db/types';
import {
  CanonContextSummary,
  ChapterAnalysisResult,
  ValidatedAiFinding,
} from './types';
import { checkOllamaStatus, queryLocalOllama } from './ollama';

function computeFindingFingerprint(category: string, title: string, passageSnippet?: string | null): string {
  const normTitle = title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const normPassage = (passageSnippet || '').toLowerCase().trim().slice(0, 60).replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(`${category}:${normTitle}:${normPassage}`).digest('hex');
}

/**
 * Deterministic analysis rules run locally on manuscript text and canon rows
 * without needing an active LLM. Guaranteed 100% offline and deterministic.
 */
function runDeterministicManuscriptRules(params: {
  chapter: Chapter;
  universeId?: string | null;
  storyId?: string | null;
  characters: Character[];
  secrets: Secret[];
  characterSecrets: (CharacterSecret & { character_name?: string; secret_title?: string })[];
  locations: Location[];
  events: UniverseEvent[];
}): ChapterAnalysisFinding[] {
  const { chapter, universeId, storyId, characters, secrets, characterSecrets } = params;
  const content = chapter.content || '';
  const findings: ChapterAnalysisFinding[] = [];

  if (!content.trim()) return findings;

  // 1. RULE: Post-Mortem Character Appearance in Manuscript
  // If a character with confirmed death or death_year is mentioned as present in manuscript text
  for (const char of characters) {
    if (char.death_confirmed || char.death_year !== null || char.status === 'deceased') {
      const nameVariants = [char.name];
      const significantParts = char.name
        .split(/\s+/)
        .filter((p) => p.length >= 4 && !['Lord', 'Lady', 'Grand', 'Commander', 'High', 'Archivist'].includes(p));
      for (const sp of significantParts) {
        if (!nameVariants.includes(sp)) nameVariants.push(sp);
      }

      let match: RegExpExecArray | null = null;
      let matchedName = char.name;
      for (const nv of nameVariants) {
        const regex = new RegExp(`\\b${nv.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const m = regex.exec(content);
        if (m) {
          match = m;
          matchedName = nv;
          break;
        }
      }

      if (match) {
        // Extract surrounding sentence/passage
        const start = Math.max(0, match.index - 50);
        const end = Math.min(content.length, match.index + matchedName.length + 70);
        const passage = content.slice(start, end).trim();

        const title = `Post-Mortem Activity: ${char.name} appears in scene while canonically deceased`;
        const explanation = `Character "${char.name}" is recorded in universe canon as deceased (Status: ${char.status}, Death Year: ${char.death_year ?? 'Unspecified'}), yet is actively depicted or referenced in this chapter passage.`;
        const conflictingCanon = `Character canon record for "${char.name}": status=${char.status}, death_confirmed=${char.death_confirmed}, death_year=${char.death_year ?? 'N/A'}.`;
        const suggestedFix = `Clarify if this scene is a flashback, a spectral/astral projection, an unverified rumor, or update ${char.name}'s canon status if resurrected.`;
        const fingerprint = computeFindingFingerprint('timeline_paradox', title, passage);

        findings.push({
          id: `find-det-${crypto.randomUUID().slice(0, 10)}`,
          chapter_id: chapter.id,
          universe_id: universeId || null,
          story_id: storyId || chapter.story_id || null,
          chapter_version: chapter.version,
          category: 'timeline_paradox',
          severity: 'critical',
          title,
          description: explanation,
          passage,
          passage_reference: `Character "${char.name}" at character offset ${match.index}`,
          conflicting_canon: conflictingCanon,
          explanation,
          suggested_fix: suggestedFix,
          confidence: 1.0,
          status: 'open',
          dismissal_reason: null,
          author_notes: null,
          source: 'deterministic_rule',
          fingerprint,
          is_stale: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // 2. RULE: Premature or Unlearned Secret Reference
  // Check if forbidden or major secrets are mentioned, and whether present characters know it
  for (const sec of secrets) {
    if (sec.title && sec.title.length > 4) {
      const secRegex = new RegExp(`\\b${sec.title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      const match = secRegex.exec(content);
      if (match) {
        // Find which characters in universe actually know this secret
        const knowers = characterSecrets.filter((cs) => cs.secret_id === sec.id);
        const knowerNames = knowers.map((k) => k.character_name || k.character_id).join(', ');

        const start = Math.max(0, match.index - 40);
        const end = Math.min(content.length, match.index + sec.title.length + 60);
        const passage = content.slice(start, end).trim();

        // Check if any characters in scene are NOT authorized knowers
        const presentCharacters = characters.filter((c) =>
          new RegExp(`\\b${c.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(content)
        );
        const unauthorizedPresent = presentCharacters.filter(
          (c) => !knowers.some((k) => k.character_id === c.id)
        );

        if (unauthorizedPresent.length > 0 && knowers.length > 0) {
          const title = `Premature Secret Exposure: "${sec.title}" referenced in presence of uninitiated characters`;
          const unauthorizedNames = unauthorizedPresent.map((c) => c.name).join(', ');
          const explanation = `Secret "${sec.title}" (Severity: ${sec.severity}) is referenced in this scene, but characters present (${unauthorizedNames}) have no record of learning this secret in the canon knowledge graph. Authorized keepers: [${knowerNames || 'None'}].`;
          const conflictingCanon = `Secret "${sec.title}" is restricted to: ${knowerNames || 'None'}. Characters in scene without secret clearance: ${unauthorizedNames}.`;
          const suggestedFix = `Explicitly narrate how ${unauthorizedNames} learned of "${sec.title}", or record an event in the timeline where this secret was conveyed.`;
          const fingerprint = computeFindingFingerprint('character_knowledge', title, passage);

          findings.push({
            id: `find-det-${crypto.randomUUID().slice(0, 10)}`,
            chapter_id: chapter.id,
            universe_id: universeId || null,
            story_id: storyId || chapter.story_id || null,
            chapter_version: chapter.version,
            category: 'character_knowledge',
            severity: 'high',
            title,
            description: explanation,
            passage,
            passage_reference: `Secret reference "${sec.title}" around offset ${match.index}`,
            conflicting_canon: conflictingCanon,
            explanation,
            suggested_fix: suggestedFix,
            confidence: 0.95,
            status: 'open',
            dismissal_reason: null,
            author_notes: null,
            source: 'deterministic_rule',
            fingerprint,
            is_stale: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Intelligent canon context builder: selects only relevant characters, locations,
 * prior chapter context, and timeline events to stay within context budgets.
 */
function buildRelevantCanonContext(params: {
  chapter: Chapter;
  characters: Character[];
  locations: Location[];
  events: UniverseEvent[];
  secrets: Secret[];
  previousChapters: Chapter[];
}): { contextText: string; summary: CanonContextSummary } {
  const { chapter, characters, locations, events, secrets, previousChapters } = params;
  const content = chapter.content || '';

  // 1. Identify mentioned entities
  const mentionedCharacters = characters.filter((c) =>
    new RegExp(`\\b${c.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(content)
  );
  // Include up to 8 mentioned characters, or top 5 if none directly matched
  const relevantChars = (mentionedCharacters.length > 0 ? mentionedCharacters : characters).slice(0, 8);

  const mentionedLocations = locations.filter((l) =>
    new RegExp(`\\b${l.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(content)
  );
  const relevantLocations = (mentionedLocations.length > 0 ? mentionedLocations : locations).slice(0, 5);

  const relevantEvents = events.slice(0, 8);
  const relevantSecrets = secrets.slice(0, 5);
  const relevantPrevChapters = previousChapters.slice(0, 3);

  // 2. Format compact canon prompt section
  let contextText = `=== CANON REPOSITORY CONTEXT (RELEVANT ENTITIES ONLY) ===\n\n`;

  contextText += `[PRIOR CHAPTERS SUMMARY]\n`;
  if (relevantPrevChapters.length === 0) {
    contextText += `None. This is Chapter #${chapter.sequence_number}.\n`;
  } else {
    for (const pc of relevantPrevChapters) {
      contextText += `- Chapter ${pc.sequence_number} "${pc.title}": ${pc.summary}\n`;
    }
  }
  contextText += `\n`;

  contextText += `[CHARACTERS & STATUS]\n`;
  for (const c of relevantChars) {
    contextText += `- ${c.name} (${c.epithet || 'No epithet'}): Status=${c.status}, BirthYear=${c.birth_year ?? '?'}, DeathYear=${c.death_year ?? 'N/A'}. Bio: ${c.bio.slice(0, 160)}\n`;
  }
  contextText += `\n`;

  contextText += `[LOCATIONS & REALMS]\n`;
  for (const l of relevantLocations) {
    contextText += `- ${l.name} (Realm: ${l.realm}): ${l.description.slice(0, 140)}\n`;
  }
  contextText += `\n`;

  contextText += `[KNOWN SECRETS & RESTRICTIONS]\n`;
  for (const s of relevantSecrets) {
    contextText += `- Secret "${s.title}" (Severity: ${s.severity}): ${s.content.slice(0, 120)}\n`;
  }
  contextText += `\n`;

  contextText += `[CHRONOLOGICAL TIMELINE EVENTS]\n`;
  for (const e of relevantEvents) {
    contextText += `- Year ${e.timestamp_year}: "${e.title}" (${e.description?.slice(0, 120) || 'No details'})\n`;
  }

  const passageWords = content.trim().split(/\s+/).filter(Boolean).length;
  const approximateTokens = Math.round((contextText.length + content.length) / 3.8);

  const summary: CanonContextSummary = {
    charactersCount: relevantChars.length,
    locationsCount: relevantLocations.length,
    eventsCount: relevantEvents.length,
    relationshipsCount: 0,
    secretsCount: relevantSecrets.length,
    previousChaptersCount: relevantPrevChapters.length,
    passageWords,
    approximateTokens,
    isTruncated: false,
    modelUsed: process.env.OLLAMA_MODEL || 'llama3.2',
  };

  return { contextText, summary };
}

/**
 * End-to-end Chapter Analysis Pipeline:
 * 1. Fetches chapter and relevant canon from PostgreSQL.
 * 2. Executes deterministic continuity rules (runs 100% offline).
 * 3. Checks local Ollama runtime; if available, queries model for subtle narrative contradictions.
 * 4. Deduplicates against existing findings, preserving author dismissals & notes.
 * 5. Persists findings to chapter_analysis_findings and returns structured result.
 */
export async function analyzeChapterManuscript(params: {
  universeId?: string;
  storyId?: string;
  chapterId: string;
  userId: string;
}): Promise<ChapterAnalysisResult> {
  const { universeId: reqUniverseId, storyId: reqStoryId, chapterId, userId } = params;

  // 1. Fetch chapter from database
  let chapter: Chapter | null = null;
  let storyId = reqStoryId;
  let universeId = reqUniverseId;

  if (storyId) {
    const chapRes = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND story_id = $2',
      [chapterId, storyId]
    );
    if (chapRes.rows.length > 0) {
      chapter = chapRes.rows[0];
    }
  } else if (universeId) {
    const chapRes = await query<Chapter>(
      `SELECT c.* FROM chapters c
       WHERE c.id = $1 AND (
         c.universe_id = $2 
         OR c.story_id IN (SELECT su.story_id FROM story_universes su WHERE su.universe_id = $2)
       )`,
      [chapterId, universeId]
    );
    if (chapRes.rows.length > 0) {
      chapter = chapRes.rows[0];
    }
  }

  // Fallback: search by chapterId directly
  if (!chapter) {
    const chapRes = await query<Chapter>('SELECT * FROM chapters WHERE id = $1', [chapterId]);
    if (chapRes.rows.length > 0) {
      chapter = chapRes.rows[0];
      if (!storyId && chapter.story_id) storyId = chapter.story_id;
      if (!universeId && chapter.universe_id) universeId = chapter.universe_id;
    }
  }

  if (!chapter) {
    throw new Error('Chapter not found in specified universe or story');
  }

  // Determine all relevant universe IDs
  const targetUniverseIds: string[] = [];
  if (universeId && universeId !== 'univ-standalone') {
    targetUniverseIds.push(universeId);
  }
  if (storyId) {
    const suRes = await query<{ universe_id: string }>(
      'SELECT universe_id FROM story_universes WHERE story_id = $1',
      [storyId]
    );
    for (const row of suRes.rows) {
      if (!targetUniverseIds.includes(row.universe_id)) {
        targetUniverseIds.push(row.universe_id);
      }
    }
  }
  if (chapter.universe_id && !targetUniverseIds.includes(chapter.universe_id) && chapter.universe_id !== 'univ-standalone') {
    targetUniverseIds.push(chapter.universe_id);
  }

  // If still no universe linked, fallback to user's first available universe or demo
  if (targetUniverseIds.length === 0) {
    const userUniv = await query<{ id: string }>(
      'SELECT id FROM universes WHERE user_id = $1 OR is_example = true ORDER BY is_example ASC, created_at DESC LIMIT 1',
      [userId]
    );
    if (userUniv.rows.length > 0) {
      targetUniverseIds.push(userUniv.rows[0].id);
    }
  }

  const primaryUniverseId = targetUniverseIds[0] || (universeId !== 'univ-standalone' ? universeId : null) || null;

  // 2. Fetch universe canon entities from PostgreSQL
  const [charsRes, locsRes, eventsRes, secretsRes, charSecretsRes, prevChapsRes] = await Promise.all([
    targetUniverseIds.length > 0
      ? query<Character>('SELECT * FROM characters WHERE universe_id = ANY($1::text[]) ORDER BY name ASC', [targetUniverseIds])
      : Promise.resolve({ rows: [] as Character[] }),
    targetUniverseIds.length > 0
      ? query<Location>('SELECT * FROM locations WHERE universe_id = ANY($1::text[]) ORDER BY name ASC', [targetUniverseIds])
      : Promise.resolve({ rows: [] as Location[] }),
    targetUniverseIds.length > 0
      ? query<UniverseEvent>(
          'SELECT * FROM events WHERE universe_id = ANY($1::text[]) ORDER BY sequence_number ASC, timestamp_year ASC',
          [targetUniverseIds]
        )
      : Promise.resolve({ rows: [] as UniverseEvent[] }),
    targetUniverseIds.length > 0
      ? query<Secret>('SELECT * FROM secrets WHERE universe_id = ANY($1::text[]) ORDER BY created_at ASC', [targetUniverseIds])
      : Promise.resolve({ rows: [] as Secret[] }),
    targetUniverseIds.length > 0
      ? query<CharacterSecret & { character_name?: string; secret_title?: string }>(
          `SELECT cs.*, c.name as character_name, s.title as secret_title
           FROM character_secrets cs
           JOIN characters c ON cs.character_id = c.id
           JOIN secrets s ON cs.secret_id = s.id
           WHERE c.universe_id = ANY($1::text[])`,
          [targetUniverseIds]
        )
      : Promise.resolve({ rows: [] as (CharacterSecret & { character_name?: string; secret_title?: string })[] }),
    storyId
      ? query<Chapter>(
          'SELECT * FROM chapters WHERE story_id = $1 AND sequence_number < $2 ORDER BY sequence_number ASC',
          [storyId, chapter.sequence_number]
        )
      : (targetUniverseIds.length > 0
          ? query<Chapter>(
              'SELECT * FROM chapters WHERE universe_id = ANY($1::text[]) AND sequence_number < $2 ORDER BY sequence_number ASC',
              [targetUniverseIds, chapter.sequence_number]
            )
          : Promise.resolve({ rows: [] as Chapter[] })),
  ]);

  const characters = charsRes.rows;
  const locations = locsRes.rows;
  const events = eventsRes.rows;
  const secrets = secretsRes.rows;
  const characterSecrets = charSecretsRes.rows;
  const previousChapters = prevChapsRes.rows;

  // 3. Stage 1: Deterministic Continuity Oracle Rules (Always runs, zero external dependencies)
  const deterministicFindings = runDeterministicManuscriptRules({
    chapter,
    universeId: primaryUniverseId,
    storyId: storyId || chapter.story_id || null,
    characters,
    secrets,
    characterSecrets,
    locations,
    events,
  });

  // 4. Stage 2: Local AI Runtime narrative inspection (if local Ollama is active)
  const runtimeStatus = await checkOllamaStatus();
  const aiRawFindings: ValidatedAiFinding[] = [];

  const { contextText, summary: contextStats } = buildRelevantCanonContext({
    chapter,
    characters,
    locations,
    events,
    secrets,
    previousChapters,
  });

  if (runtimeStatus.isAvailable && runtimeStatus.modelAvailable && chapter.content.trim().length > 10) {
    const systemPrompt = `You are the WORLDBUILD Continuity Oracle, an intelligent, meticulous fiction continuity editor.
Your task is to analyze the provided chapter manuscript against the established universe canon and identify potential narrative contradictions, plot holes, or unearned leaps of logic.

Focus strictly on:
1. Character knowledge inconsistencies (a character acting on or referencing facts never revealed to them in prior chapters or canon).
2. Unexplained physical or object transfers (a character suddenly possessing an artifact that was left elsewhere, without explanation).
3. Spatial impossibilities (instant travel between realms without magical portals or transit).
4. Unresolved setups or conflicting promises with prior chapters.

DO NOT flag deliberate stylistic choices, poetic metaphors, or mystery hooks as errors unless there is a genuine causal contradiction.

Respond ONLY with valid JSON conforming to this schema:
{
  "findings": [
    {
      "category": "character_knowledge" | "timeline_paradox" | "spatial_impossibility" | "object_continuity" | "unexplained_transfer" | "causal_inconsistency" | "unresolved_setup",
      "severity": "critical" | "high" | "medium" | "low",
      "title": "Short descriptive title of the contradiction",
      "description": "Clear explanation of why this contradicts canon",
      "passage": "Exact verbatim quote or sentence from the chapter text",
      "conflicting_canon": "The specific canon rule, event, or character trait that contradicts this",
      "explanation": "Detailed explanation of the causal conflict",
      "suggested_fix": "Practical, author-friendly suggestion to reconcile the contradiction",
      "confidence": 0.85
    }
  ]
}`;

    const userPrompt = `${contextText}

=== CHAPTER MANUSCRIPT (Chapter #${chapter.sequence_number}: "${chapter.title}") ===
${chapter.content}

=== END MANUSCRIPT ===

Analyze this manuscript strictly against the canon above. If no genuine plot-holes exist, return {"findings": []}.`;

    try {
      const { findings: validatedAi } = await queryLocalOllama(userPrompt, systemPrompt);
      aiRawFindings.push(...validatedAi);
    } catch (aiErr) {
      // Gracefully record AI runtime issue in status without failing deterministic rules
      runtimeStatus.errorMessage = `Local AI analysis skipped: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
    }
  }

  // 5. Convert AI findings to ChapterAnalysisFinding records
  const aiFindings: ChapterAnalysisFinding[] = aiRawFindings.map((ai) => {
    const fingerprint = computeFindingFingerprint(ai.category, ai.title, ai.passage);
    return {
      id: `find-ai-${crypto.randomUUID().slice(0, 10)}`,
      chapter_id: chapter.id,
      universe_id: primaryUniverseId,
      story_id: storyId || chapter.story_id || null,
      chapter_version: chapter.version,
      category: ai.category,
      severity: ai.severity,
      title: ai.title,
      description: ai.description,
      passage: ai.passage,
      passage_reference: ai.passage_reference,
      conflicting_canon: ai.conflicting_canon,
      explanation: ai.explanation,
      suggested_fix: ai.suggested_fix,
      confidence: ai.confidence,
      status: 'open',
      dismissal_reason: null,
      author_notes: null,
      source: 'local_ai',
      fingerprint,
      is_stale: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  // Deduplicate candidate findings by fingerprint to prevent redundant processing
  const uniqueCandidateMap = new Map<string, ChapterAnalysisFinding>();
  for (const cand of [...deterministicFindings, ...aiFindings]) {
    if (!uniqueCandidateMap.has(cand.fingerprint)) {
      uniqueCandidateMap.set(cand.fingerprint, cand);
    }
  }
  const allCandidateFindings = Array.from(uniqueCandidateMap.values());

  // 6. Fetch existing findings for this chapter to preserve author state (dismissals, accepted fixes)
  const existingFindingsRes = await query<ChapterAnalysisFinding>(
    'SELECT * FROM chapter_analysis_findings WHERE chapter_id = $1',
    [chapterId]
  );
  const existingMap = new Map<string, ChapterAnalysisFinding>();
  for (const row of existingFindingsRes.rows) {
    existingMap.set(row.fingerprint, row);
  }

  // 7. Upsert findings idempotently
  const finalFindings: ChapterAnalysisFinding[] = [];

  for (const cand of allCandidateFindings) {
    const existing = existingMap.get(cand.fingerprint);

    if (!existing) {
      // New finding
      await query(
        `INSERT INTO chapter_analysis_findings (
          id, chapter_id, universe_id, story_id, chapter_version, category, severity,
          title, description, passage, passage_reference, conflicting_canon,
          explanation, suggested_fix, confidence, status, dismissal_reason,
          author_notes, source, fingerprint, is_stale, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, 'open', NULL,
          NULL, $16, $17, false, NOW(), NOW()
        )
        ON CONFLICT (chapter_id, fingerprint) DO UPDATE SET
          chapter_version = EXCLUDED.chapter_version,
          description = EXCLUDED.description,
          explanation = EXCLUDED.explanation,
          suggested_fix = EXCLUDED.suggested_fix,
          conflicting_canon = EXCLUDED.conflicting_canon,
          confidence = EXCLUDED.confidence,
          is_stale = false,
          updated_at = NOW()`,
        [
          cand.id,
          cand.chapter_id,
          cand.universe_id || primaryUniverseId,
          cand.story_id || storyId || chapter.story_id || null,
          cand.chapter_version,
          cand.category,
          cand.severity,
          cand.title,
          cand.description,
          cand.passage,
          cand.passage_reference,
          cand.conflicting_canon,
          cand.explanation,
          cand.suggested_fix,
          cand.confidence,
          cand.source,
          cand.fingerprint,
        ]
      );
      finalFindings.push(cand);
      existingMap.set(cand.fingerprint, cand);
    } else {
      // Existing finding: Preserve author's status (dismissed, accepted, resolved) and author notes
      // Reset is_stale to false because this finding was re-detected on current version
      await query(
        `UPDATE chapter_analysis_findings
         SET chapter_version = $1,
             description = $2,
             explanation = $3,
             suggested_fix = $4,
             conflicting_canon = $5,
             confidence = $6,
             is_stale = false,
             updated_at = NOW()
         WHERE id = $7`,
        [
          chapter.version,
          cand.description,
          cand.explanation,
          cand.suggested_fix,
          cand.conflicting_canon,
          cand.confidence,
          existing.id,
        ]
      );

      finalFindings.push({
        ...existing,
        chapter_version: chapter.version,
        description: cand.description,
        explanation: cand.explanation,
        suggested_fix: cand.suggested_fix,
        conflicting_canon: cand.conflicting_canon,
        confidence: cand.confidence,
        is_stale: false,
      });
    }
  }

  // Also include any pre-existing dismissed/accepted findings that weren't re-detected but author saved
  for (const existing of existingFindingsRes.rows) {
    if (!finalFindings.some((f) => f.fingerprint === existing.fingerprint)) {
      finalFindings.push(existing);
    }
  }

  // 8. Generate summary metrics
  const summary = {
    total: finalFindings.length,
    deterministicCount: finalFindings.filter((f) => f.source === 'deterministic_rule').length,
    aiCount: finalFindings.filter((f) => f.source === 'local_ai').length,
    criticalCount: finalFindings.filter((f) => f.severity === 'critical').length,
    highCount: finalFindings.filter((f) => f.severity === 'high').length,
    mediumCount: finalFindings.filter((f) => f.severity === 'medium').length,
    lowCount: finalFindings.filter((f) => f.severity === 'low').length,
    openCount: finalFindings.filter((f) => f.status === 'open').length,
  };

  return {
    chapterId,
    universeId: primaryUniverseId,
    storyId: storyId || chapter.story_id || null,
    chapterVersion: chapter.version,
    findings: finalFindings,
    summary,
    contextStats,
    runtimeStatus,
  };
}
