import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { ChapterEntityLink, Character, Location } from '@/lib/db/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string; linkId: string }> }
) {
  try {
    const { id: universeId, chapterId, linkId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const entityType = body.entity_type; // 'character' | 'location'
    const name = (body.name || '').trim();

    if (!entityType || !['character', 'location'].includes(entityType)) {
      return NextResponse.json({ error: 'entity_type must be "character" or "location"' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const linkRes = await query<ChapterEntityLink>(
      'SELECT * FROM chapter_entity_links WHERE id = $1 AND chapter_id = $2 AND universe_id = $3',
      [linkId, chapterId, universeId]
    );

    if (linkRes.rows.length === 0) {
      return NextResponse.json({ error: 'Entity link not found' }, { status: 404 });
    }

    const link = linkRes.rows[0];

    const result = await transaction(async (client) => {
      if (entityType === 'character') {
        const charId = `char-${crypto.randomUUID().slice(0, 10)}`;
        const epithet = body.epithet?.trim() || null;
        const bio = body.bio?.trim() || `Discovered and registered from manuscript chapter.`;
        const aliases = body.aliases?.trim() || link.matched_alias || '';

        await client.query<Character>(
          `INSERT INTO characters (
            id, universe_id, name, epithet, bio, status, aliases, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'alive', $6, NOW(), NOW())`,
          [charId, universeId, name, epithet, bio, aliases]
        );

        // Update the link to point to this new character and mark confirmed
        const updatedLinkRes = await client.query<ChapterEntityLink>(
          `UPDATE chapter_entity_links
           SET entity_type = 'character',
               entity_id = $1,
               character_id = $1,
               entity_name = $2,
               status = 'confirmed',
               source = 'author_confirmed',
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [charId, name, linkId]
        );

        return {
          createdEntity: { id: charId, type: 'character', name },
          character: { id: charId, name, bio, status: 'alive' },
          link: updatedLinkRes.rows[0],
        };
      } else {
        const locId = `loc-${crypto.randomUUID().slice(0, 10)}`;
        const realm = body.realm?.trim() || 'Known Realm';
        const description = body.description?.trim() || `Location registered from manuscript chapter scene.`;
        const aliases = body.aliases?.trim() || link.matched_alias || '';

        await client.query<Location>(
          `INSERT INTO locations (
            id, universe_id, name, realm, description, aliases, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [locId, universeId, name, realm, description, aliases]
        );

        const updatedLinkRes = await client.query<ChapterEntityLink>(
          `UPDATE chapter_entity_links
           SET entity_type = 'location',
               entity_id = $1,
               location_id = $1,
               entity_name = $2,
               status = 'confirmed',
               source = 'author_confirmed',
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [locId, name, linkId]
        );

        return {
          createdEntity: { id: locId, type: 'location', name },
          location: { id: locId, name, realm, description },
          link: updatedLinkRes.rows[0],
        };
      }
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to register entity';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
