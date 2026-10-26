import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { Chapter, PublishedChapterSnapshot, PublishedStory, Story } from '@/lib/db/types';
import { ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { isSlugAvailable, isValidSlug, ensureUniqueSlug } from './slug';

export interface PublishStoryInput {
  public_title?: string;
  public_description?: string;
  slug?: string;
  cover_url?: string | null;
  genres?: string;
  tags?: string;
  selected_chapter_ids?: string[]; // IDs of chapters to publish in order
}

export interface StoryPublicationStatusResponse {
  story: Story;
  publication: PublishedStory | null;
  chapters: {
    id: string;
    title: string;
    sequence_number: number;
    word_count: number;
    draft_version: number;
    draft_updated_at: string;
    is_published: boolean;
    published_version?: number;
    published_sequence?: number;
    published_at?: string;
    has_unpublished_changes: boolean;
  }[];
  is_published: boolean;
  has_unpublished_story_changes: boolean;
}

export interface PublicStoryDTO {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string | null;
  genres: string[];
  tags: string[];
  publication_version: number;
  published_at: string;
  updated_at: string;
  author: {
    id: string;
    display_name: string;
    pen_name?: string;
    bio?: string;
    avatar_url?: string | null;
  };
  chapters: {
    sequence_number: number;
    title: string;
    word_count: number;
    published_at: string;
  }[];
  total_words: number;
  chapters_count: number;
}

export interface PublicChapterDTO {
  story: {
    slug: string;
    title: string;
    author_name: string;
  };
  sequence_number: number;
  title: string;
  content: string;
  word_count: number;
  published_at: string;
  prev_sequence: number | null;
  next_sequence: number | null;
  total_chapters: number;
}

export interface PublicExploreFilters {
  q?: string;
  genre?: string;
  tag?: string;
  author?: string;
  page?: number;
  limit?: number;
  sort?: 'recent' | 'popular' | 'alpha';
}

/**
 * Validates author ownership of a story. Throws NotFoundError or ForbiddenError.
 */
export async function verifyStoryOwnership(storyId: string, userId: string): Promise<Story> {
  const res = await query<Story>('SELECT * FROM stories WHERE id = $1', [storyId]);
  if (res.rows.length === 0) {
    throw new NotFoundError('Story not found');
  }

  const story = res.rows[0];
  if (story.is_example) {
    throw new ForbiddenError('Unauthorized: canonical demo stories are read-only and cannot be published');
  }
  if (story.user_id !== userId) {
    throw new ForbiddenError('Unauthorized: only the author can publish or modify this story');
  }

  return story;
}

/**
 * Publishes or explicitly updates the publication of a story.
 * Creates an immutable snapshot for each published chapter version.
 * Atomically updates which snapshot version is publicly active.
 */
export async function publishStory(
  userId: string,
  storyId: string,
  input: PublishStoryInput = {}
): Promise<{ publication: PublishedStory; publishedSnapshots: PublishedChapterSnapshot[] }> {
  const story = await verifyStoryOwnership(storyId, userId);

  const publicTitle = (input.public_title !== undefined ? input.public_title : story.title).trim();
  if (!publicTitle) {
    throw new Error('Public story title cannot be empty');
  }

  const publicDescription = (
    input.public_description !== undefined ? input.public_description : story.description || ''
  ).trim();

  const coverUrl = input.cover_url !== undefined ? input.cover_url : story.cover_url;
  const genres = (input.genres !== undefined ? input.genres : story.genres || '').trim();
  const tags = (input.tags !== undefined ? input.tags : story.tags || '').trim();

  // Validate or generate slug
  let slug = (input.slug || story.slug || '').trim().toLowerCase();
  if (!slug) {
    slug = await ensureUniqueSlug(publicTitle, storyId);
  } else {
    if (!isValidSlug(slug)) {
      throw new Error('Invalid URL slug format. Use lowercase alphanumeric characters and hyphens.');
    }
    const available = await isSlugAvailable(slug, storyId);
    if (!available) {
      throw new Error(`The URL slug "${slug}" is already taken by another publication.`);
    }
  }

  // Retrieve chapters belonging to this story
  const allChaptersRes = await query<Chapter>(
    'SELECT * FROM chapters WHERE story_id = $1 ORDER BY sequence_number ASC',
    [storyId]
  );
  const allChapters = allChaptersRes.rows;
  const chapterMap = new Map(allChapters.map((c) => [c.id, c]));

  // Determine which chapters to publish and in what order
  let chaptersToPublish: Chapter[] = [];
  if (Array.isArray(input.selected_chapter_ids)) {
    for (const cId of input.selected_chapter_ids) {
      const ch = chapterMap.get(cId);
      if (!ch) {
        throw new Error(`Chapter ${cId} does not belong to story ${storyId}`);
      }
      chaptersToPublish.push(ch);
    }
  } else {
    // Default to all current chapters in sequence
    chaptersToPublish = [...allChapters];
  }

  // Execute publication in an atomic transaction
  return await transaction(async (client) => {
    // 1. Check existing publication
    const existingPubRes = await client.query<PublishedStory>(
      'SELECT * FROM published_stories WHERE story_id = $1 LIMIT 1',
      [storyId]
    );

    let publicationId = `pub-${crypto.randomUUID()}`;
    let publicationVersion = 1;

    if (existingPubRes.rows.length > 0) {
      const existing = existingPubRes.rows[0];
      publicationId = existing.id;
      publicationVersion = existing.publication_version + 1;

      await client.query<PublishedStory>(
        `UPDATE published_stories
         SET public_title = $1, public_description = $2, slug = $3, cover_url = $4,
             genres = $5, tags = $6, status = 'published', publication_version = $7, updated_at = NOW()
         WHERE id = $8`,
        [publicTitle, publicDescription, slug, coverUrl, genres, tags, publicationVersion, publicationId]
      );
    } else {
      await client.query<PublishedStory>(
        `INSERT INTO published_stories (
           id, story_id, author_id, slug, public_title, public_description,
           cover_url, genres, tags, status, publication_version, published_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', 1, NOW(), NOW())`,
        [publicationId, storyId, userId, slug, publicTitle, publicDescription, coverUrl, genres, tags]
      );
    }

    // 2. Synchronize story status and slug
    await client.query(
      `UPDATE stories
       SET status = 'published', slug = $1, genres = $2, tags = $3, updated_at = NOW()
       WHERE id = $4`,
      [slug, genres, tags, storyId]
    );

    // 3. Mark unselected chapters' previous snapshots as not current
    const selectedIdSet = new Set(chaptersToPublish.map((c) => c.id));
    for (const chapter of allChapters) {
      if (!selectedIdSet.has(chapter.id)) {
        await client.query(
          `UPDATE published_chapter_snapshots
           SET is_current = false
           WHERE published_story_id = $1 AND chapter_id = $2`,
          [publicationId, chapter.id]
        );
      }
    }

    // 4. Create immutable published snapshots for each selected chapter
    const publishedSnapshots: PublishedChapterSnapshot[] = [];

    for (let index = 0; index < chaptersToPublish.length; index++) {
      const ch = chaptersToPublish[index];
      const assignedSequence = index + 1;
      const wordCount = ch.word_count || ch.content.trim().split(/\s+/).filter(Boolean).length;

      // Find max previous snapshot version for this chapter in this story
      const prevVersionRes = await client.query<{ max_version: number | null }>(
        `SELECT MAX(version_number) as max_version
         FROM published_chapter_snapshots
         WHERE published_story_id = $1 AND chapter_id = $2`,
        [publicationId, ch.id]
      );
      const nextVersionNumber = (prevVersionRes.rows[0]?.max_version ?? 0) + 1;

      // Atomically deactivate previous snapshots for this chapter
      await client.query(
        `UPDATE published_chapter_snapshots
         SET is_current = false
         WHERE published_story_id = $1 AND chapter_id = $2 AND is_current = true`,
        [publicationId, ch.id]
      );

      // Insert new immutable snapshot with is_current = true
      const snapshotId = `pcs-${crypto.randomUUID()}`;
      const snapRes = await client.query<PublishedChapterSnapshot>(
        `INSERT INTO published_chapter_snapshots (
           id, published_story_id, chapter_id, sequence_number, title, content,
           word_count, version_number, is_current, published_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
         RETURNING *`,
        [snapshotId, publicationId, ch.id, assignedSequence, ch.title, ch.content, wordCount, nextVersionNumber]
      );

      publishedSnapshots.push(snapRes.rows[0]);
    }

    // Retrieve fresh published story
    const pubRes = await client.query<PublishedStory>(
      'SELECT * FROM published_stories WHERE id = $1',
      [publicationId]
    );

    return {
      publication: pubRes.rows[0],
      publishedSnapshots,
    };
  });
}

/**
 * Unpublishes a story, removing public access from all public discovery pages and reader endpoints.
 * Historical snapshots remain preserved in the database.
 */
export async function unpublishStory(userId: string, storyId: string): Promise<void> {
  await verifyStoryOwnership(storyId, userId);

  await transaction(async (client) => {
    await client.query(
      `UPDATE published_stories
       SET status = 'unpublished', updated_at = NOW()
       WHERE story_id = $1`,
      [storyId]
    );

    await client.query(
      `UPDATE stories
       SET status = 'draft', updated_at = NOW()
       WHERE id = $1`,
      [storyId]
    );
  });
}

/**
 * Retrieves the full publication state, draft vs published comparison, and unpublished change indicators.
 */
export async function getStoryPublicationStatus(
  userId: string,
  storyId: string
): Promise<StoryPublicationStatusResponse> {
  const story = await verifyStoryOwnership(storyId, userId);

  const pubRes = await query<PublishedStory>(
    'SELECT * FROM published_stories WHERE story_id = $1 LIMIT 1',
    [storyId]
  );
  const publication = pubRes.rows[0] || null;

  const chaptersRes = await query<Chapter>(
    'SELECT * FROM chapters WHERE story_id = $1 ORDER BY sequence_number ASC',
    [storyId]
  );

  let snapshots: PublishedChapterSnapshot[] = [];
  if (publication) {
    const snapRes = await query<PublishedChapterSnapshot>(
      `SELECT * FROM published_chapter_snapshots
       WHERE published_story_id = $1 AND is_current = true`,
      [publication.id]
    );
    snapshots = snapRes.rows;
  }

  const snapshotMap = new Map(snapshots.map((s) => [s.chapter_id, s]));

  let hasAnyUnpublishedStoryChange = false;
  if (!publication) {
    hasAnyUnpublishedStoryChange = true;
  } else if (publication.status !== 'published') {
    hasAnyUnpublishedStoryChange = true;
  } else {
    if (
      story.title !== publication.public_title ||
      (story.description || '') !== (publication.public_description || '') ||
      story.cover_url !== publication.cover_url
    ) {
      hasAnyUnpublishedStoryChange = true;
    }
  }

  const chapterStatusList = chaptersRes.rows.map((ch) => {
    const currentSnap = snapshotMap.get(ch.id);
    const isPublished = Boolean(currentSnap && publication?.status === 'published');

    let hasUnpublishedChanges = false;
    if (!currentSnap) {
      hasUnpublishedChanges = true;
    } else {
      if (currentSnap.title !== ch.title || currentSnap.content !== ch.content) {
        hasUnpublishedChanges = true;
      }
    }

    if (hasUnpublishedChanges) {
      hasAnyUnpublishedStoryChange = true;
    }

    return {
      id: ch.id,
      title: ch.title,
      sequence_number: ch.sequence_number,
      word_count: ch.word_count,
      draft_version: ch.version,
      draft_updated_at: ch.updated_at,
      is_published: isPublished,
      published_version: currentSnap?.version_number,
      published_sequence: currentSnap?.sequence_number,
      published_at: currentSnap?.published_at,
      has_unpublished_changes: hasUnpublishedChanges,
    };
  });

  return {
    story,
    publication,
    chapters: chapterStatusList,
    is_published: publication?.status === 'published',
    has_unpublished_story_changes: hasAnyUnpublishedStoryChange,
  };
}

/**
 * Public Story Detail: Queries only published content. Never exposes private notes, draft edits,
 * or continuity oracle records.
 */
export async function getPublicStoryBySlug(slug: string): Promise<PublicStoryDTO> {
  const normSlug = (slug || '').trim().toLowerCase();
  if (!normSlug) {
    throw new NotFoundError('Story not found');
  }

  const res = await query<
    PublishedStory & {
      author_display_name: string;
      pen_name: string | null;
      author_bio: string | null;
      author_avatar: string | null;
    }
  >(
    `SELECT 
       p.*,
       u.display_name as author_display_name,
       ap.pen_name,
       ap.bio as author_bio,
       ap.avatar_url as author_avatar
     FROM published_stories p
     JOIN app_users u ON p.author_id = u.id
     LEFT JOIN author_profiles ap ON p.author_id = ap.user_id
     WHERE p.slug = $1 AND p.status = 'published'
     LIMIT 1`,
    [normSlug]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError('Story not found or not currently published');
  }

  const pub = res.rows[0];

  // Fetch only current active published chapter snapshots
  const chapRes = await query<{
    sequence_number: number;
    title: string;
    word_count: number;
    published_at: string;
  }>(
    `SELECT sequence_number, title, word_count, published_at
     FROM published_chapter_snapshots
     WHERE published_story_id = $1 AND is_current = true
     ORDER BY sequence_number ASC`,
    [pub.id]
  );

  const chapters = chapRes.rows;
  const totalWords = chapters.reduce((acc, c) => acc + (c.word_count || 0), 0);

  const genres = pub.genres
    ? pub.genres.split(',').map((g) => g.trim()).filter(Boolean)
    : [];
  const tags = pub.tags
    ? pub.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return {
    id: pub.id,
    slug: pub.slug,
    title: pub.public_title,
    description: pub.public_description,
    cover_url: pub.cover_url,
    genres,
    tags,
    publication_version: pub.publication_version,
    published_at: pub.published_at,
    updated_at: pub.updated_at,
    author: {
      id: pub.author_id,
      display_name: pub.author_display_name,
      pen_name: pub.pen_name || pub.author_display_name,
      bio: pub.author_bio || undefined,
      avatar_url: pub.author_avatar,
    },
    chapters,
    total_words: totalWords,
    chapters_count: chapters.length,
  };
}

/**
 * Public Chapter Reader: Retrieves immutable snapshot content for a specific chapter in a published story.
 */
export async function getPublicChapter(slug: string, sequenceNumber: number): Promise<PublicChapterDTO> {
  const normSlug = (slug || '').trim().toLowerCase();
  const pubRes = await query<{ id: string; public_title: string; author_name: string }>(
    `SELECT p.id, p.public_title, COALESCE(ap.pen_name, u.display_name) as author_name
     FROM published_stories p
     JOIN app_users u ON p.author_id = u.id
     LEFT JOIN author_profiles ap ON p.author_id = ap.user_id
     WHERE p.slug = $1 AND p.status = 'published'
     LIMIT 1`,
    [normSlug]
  );

  if (pubRes.rows.length === 0) {
    throw new NotFoundError('Story not found or not published');
  }

  const pub = pubRes.rows[0];

  // Retrieve the requested snapshot
  const snapRes = await query<PublishedChapterSnapshot>(
    `SELECT * FROM published_chapter_snapshots
     WHERE published_story_id = $1 AND sequence_number = $2 AND is_current = true
     LIMIT 1`,
    [pub.id, sequenceNumber]
  );

  if (snapRes.rows.length === 0) {
    throw new NotFoundError(`Chapter ${sequenceNumber} not found in this published story`);
  }

  const snapshot = snapRes.rows[0];

  // Count total current chapters & determine prev/next
  const allSeqRes = await query<{ sequence_number: number }>(
    `SELECT sequence_number
     FROM published_chapter_snapshots
     WHERE published_story_id = $1 AND is_current = true
     ORDER BY sequence_number ASC`,
    [pub.id]
  );

  const sequences = allSeqRes.rows.map((r) => r.sequence_number);
  const currentIndex = sequences.indexOf(sequenceNumber);
  const prevSequence = currentIndex > 0 ? sequences[currentIndex - 1] : null;
  const nextSequence = currentIndex < sequences.length - 1 ? sequences[currentIndex + 1] : null;

  return {
    story: {
      slug: normSlug,
      title: pub.public_title,
      author_name: pub.author_name,
    },
    sequence_number: snapshot.sequence_number,
    title: snapshot.title,
    content: snapshot.content,
    word_count: snapshot.word_count,
    published_at: snapshot.published_at,
    prev_sequence: prevSequence,
    next_sequence: nextSequence,
    total_chapters: sequences.length,
  };
}

/**
 * Public Story Discovery: Searches and filters published stories.
 */
export async function searchPublicStories(filters: PublicExploreFilters = {}): Promise<{
  stories: {
    id: string;
    slug: string;
    title: string;
    description: string;
    cover_url: string | null;
    genres: string[];
    tags: string[];
    author_name: string;
    published_at: string;
    chapters_count: number;
    total_words: number;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(50, Math.max(1, filters.limit || 12));
  const offset = (page - 1) * limit;

  let whereSql = "WHERE p.status = 'published'";
  const params: unknown[] = [];

  if (filters.q && filters.q.trim()) {
    params.push(`%${filters.q.trim()}%`);
    whereSql += ` AND (p.public_title ILIKE $${params.length} OR p.public_description ILIKE $${params.length} OR u.display_name ILIKE $${params.length} OR ap.pen_name ILIKE $${params.length})`;
  }

  if (filters.genre && filters.genre.trim()) {
    params.push(`%${filters.genre.trim()}%`);
    whereSql += ` AND p.genres ILIKE $${params.length}`;
  }

  if (filters.tag && filters.tag.trim()) {
    params.push(`%${filters.tag.trim()}%`);
    whereSql += ` AND p.tags ILIKE $${params.length}`;
  }

  if (filters.author && filters.author.trim()) {
    params.push(`%${filters.author.trim()}%`);
    whereSql += ` AND (u.display_name ILIKE $${params.length} OR ap.pen_name ILIKE $${params.length})`;
  }

  // Count total matching stories
  const countSql = `
    SELECT COUNT(DISTINCT p.id)::int as count
    FROM published_stories p
    JOIN app_users u ON p.author_id = u.id
    LEFT JOIN author_profiles ap ON p.author_id = ap.user_id
    ${whereSql}
  `;
  const countRes = await query<{ count: number }>(countSql, params);
  const total = countRes.rows[0]?.count ?? 0;

  // Sorting
  let orderBy = 'ORDER BY p.published_at DESC';
  if (filters.sort === 'alpha') {
    orderBy = 'ORDER BY p.public_title ASC';
  } else if (filters.sort === 'popular') {
    orderBy = 'ORDER BY p.publication_version DESC, p.published_at DESC';
  }

  params.push(limit);
  const limitParamIdx = params.length;
  params.push(offset);
  const offsetParamIdx = params.length;

  const querySql = `
    SELECT 
      p.id,
      p.slug,
      p.public_title as title,
      p.public_description as description,
      p.cover_url,
      p.genres,
      p.tags,
      p.published_at,
      COALESCE(ap.pen_name, u.display_name) as author_name,
      COALESCE(ch_stats.chapters_count, 0)::int as chapters_count,
      COALESCE(ch_stats.total_words, 0)::int as total_words
    FROM published_stories p
    JOIN app_users u ON p.author_id = u.id
    LEFT JOIN author_profiles ap ON p.author_id = ap.user_id
    LEFT JOIN (
      SELECT 
        published_story_id,
        COUNT(*)::int as chapters_count,
        SUM(word_count)::int as total_words
      FROM published_chapter_snapshots
      WHERE is_current = true
      GROUP BY published_story_id
    ) ch_stats ON p.id = ch_stats.published_story_id
    ${whereSql}
    ${orderBy}
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;

  const storiesRes = await query<{
    id: string;
    slug: string;
    title: string;
    description: string;
    cover_url: string | null;
    genres: string;
    tags: string;
    published_at: string;
    author_name: string;
    chapters_count: number;
    total_words: number;
  }>(querySql, params);

  const formattedStories = storiesRes.rows.map((row) => ({
    ...row,
    genres: row.genres ? row.genres.split(',').map((g) => g.trim()).filter(Boolean) : [],
    tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  }));

  return {
    stories: formattedStories,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
