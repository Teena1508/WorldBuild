import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { ChapterEntityLink } from '@/lib/db/types';
import { processChapterEntityTracking, computeEntityLinkFingerprint } from '@/lib/continuity/entity-tracker';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const linksRes = await query<ChapterEntityLink>(
      `SELECT cel.*,
        c.name as char_canonical_name,
        l.name as loc_canonical_name,
        e.title as event_canonical_title
       FROM chapter_entity_links cel
       LEFT JOIN characters c ON cel.character_id = c.id
       LEFT JOIN locations l ON cel.location_id = l.id
       LEFT JOIN events e ON cel.event_id = e.id
       WHERE cel.chapter_id = $1 AND cel.universe_id = $2
       ORDER BY cel.status ASC, cel.created_at ASC`,
      [chapterId, universeId]
    );

    const links = linksRes.rows.map((row) => {
      let positions = [];
      try {
        positions = row.positions_json ? JSON.parse(row.positions_json) : [];
      } catch {
        positions = [];
      }
      return {
        ...row,
        positions,
      };
    });

    const summary = {
      total: links.length,
      charactersCount: links.filter((l) => l.entity_type === 'character').length,
      locationsCount: links.filter((l) => l.entity_type === 'location').length,
      eventsCount: links.filter((l) => l.entity_type === 'event').length,
      unknownCount: links.filter((l) => l.entity_type === 'unknown').length,
      confirmedCount: links.filter((l) => l.status === 'confirmed').length,
      detectedCount: links.filter((l) => l.status === 'detected').length,
      needsReviewCount: links.filter((l) => l.status === 'needs_review').length,
      dismissedCount: links.filter((l) => l.status === 'dismissed').length,
    };

    return NextResponse.json({
      links,
      summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch entity links';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();

    // 1. If explicit reprocess/detect action
    if (body.action === 'reprocess' || body.action === 'detect') {
      const trackingResult = await processChapterEntityTracking({
        chapterId,
        universeId,
        forceRecompute: true,
      });

      return NextResponse.json(trackingResult);
    }

    // 2. Manual link creation
    const entityType = body.entity_type;
    const entityId = body.entity_id || null;
    const entityName = (body.entity_name || '').trim();
    const relationshipType = body.relationship_type || 'appears';
    const authorNotes = body.author_notes || null;

    if (!entityType || !['character', 'location', 'event', 'lore_object', 'unknown'].includes(entityType)) {
      return NextResponse.json({ error: 'Valid entity_type is required' }, { status: 400 });
    }
    if (!entityName) {
      return NextResponse.json({ error: 'entity_name is required' }, { status: 400 });
    }

    const fingerprint = computeEntityLinkFingerprint(entityType, entityId, entityName);
    const linkId = `cel-${crypto.randomUUID().slice(0, 12)}`;

    let characterId = null;
    let locationId = null;
    let eventId = null;

    if (entityType === 'character' && entityId) characterId = entityId;
    if (entityType === 'location' && entityId) locationId = entityId;
    if (entityType === 'event' && entityId) eventId = entityId;

    await query(
      `INSERT INTO chapter_entity_links (
        id, chapter_id, universe_id, character_id, location_id, event_id,
        entity_type, entity_id, entity_name, relationship_type, status,
        source, confidence, mention_count, author_notes, is_stale, fingerprint,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, 'confirmed',
        'manual', 1.0, 1, $11, false, $12,
        NOW(), NOW()
      )
      ON CONFLICT (chapter_id, fingerprint) DO UPDATE SET
        status = 'confirmed',
        source = 'manual',
        relationship_type = EXCLUDED.relationship_type,
        author_notes = EXCLUDED.author_notes,
        is_stale = false,
        updated_at = NOW()`,
      [
        linkId,
        chapterId,
        universeId,
        characterId,
        locationId,
        eventId,
        entityType,
        entityId,
        entityName,
        relationshipType,
        authorNotes,
        fingerprint,
      ]
    );

    const createdRes = await query<ChapterEntityLink>(
      'SELECT * FROM chapter_entity_links WHERE chapter_id = $1 AND fingerprint = $2',
      [chapterId, fingerprint]
    );

    return NextResponse.json({ link: createdRes.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create entity link';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
