import { query } from '@/lib/db';

/**
 * Normalizes text into a clean URL-friendly slug.
 * e.g., "The Chronicles of Val-Morgath (Vol. 1)" -> "the-chronicles-of-val-morgath-vol-1"
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent diacritics
    .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric except spaces and hyphens
    .trim()
    .replace(/\s+/g, '-') // spaces to hyphens
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .substring(0, 80); // reasonable slug length limit
}

/**
 * Validates whether a slug is well-formed.
 * Rules: 2 to 100 characters, lowercase alphanumeric and hyphens, no leading/trailing hyphens.
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  if (slug.length < 2 || slug.length > 100) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Checks if a slug is available for a published story.
 * If excludeStoryId is provided, ignores that story's current publication.
 */
export async function isSlugAvailable(slug: string, excludeStoryId?: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false;

  let sql = 'SELECT id FROM published_stories WHERE slug = $1';
  const params: unknown[] = [slug];

  if (excludeStoryId) {
    params.push(excludeStoryId);
    sql += ` AND story_id != $${params.length}`;
  }

  const res = await query(sql, params);
  return res.rows.length === 0;
}

/**
 * Generates an available unique slug by appending numeric suffixes if needed.
 */
export async function ensureUniqueSlug(baseTitle: string, excludeStoryId?: string): Promise<string> {
  const baseSlug = generateSlug(baseTitle) || 'untitled-story';
  let candidate = baseSlug;
  let counter = 1;

  while (!(await isSlugAvailable(candidate, excludeStoryId))) {
    counter++;
    candidate = `${baseSlug}-${counter}`;
  }

  return candidate;
}
