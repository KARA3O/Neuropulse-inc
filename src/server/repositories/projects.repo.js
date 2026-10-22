/**
 * Data access for showcase projects.
 */

const PUBLIC_COLUMNS = 'slug, name, client, industry, summary, description, url, image_url, accent, tech, status, featured, launched_at';

/** Convert a DB row into the API shape (JSON tech array, real booleans). */
export function toProject(row) {
  if (!row) return null;
  let tech = [];
  try { tech = JSON.parse(row.tech || '[]'); } catch { /* keep [] */ }
  return {
    ...row,
    tech,
    featured: row.featured === 1,
    ...(row.published !== undefined ? { published: row.published === 1 } : {}),
  };
}

export async function listPublished(db) {
  const { results } = await db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM projects WHERE published = 1 ORDER BY featured DESC, sort_order ASC, id ASC`)
    .all();
  return results.map(toProject);
}

export async function findPublishedBySlug(db, slug) {
  return toProject(await db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM projects WHERE slug = ?1 AND published = 1`).bind(slug).first());
}

export async function listAll(db) {
  const { results } = await db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, id ASC').all();
  return results.map(toProject);
}

export async function findById(db, id) {
  return toProject(await db.prepare('SELECT * FROM projects WHERE id = ?1').bind(id).first());
}

export async function slugTaken(db, slug, exceptId = 0) {
  return !!(await db.prepare('SELECT 1 FROM projects WHERE slug = ?1 AND id != ?2').bind(slug, exceptId).first());
}

const WRITABLE = ['slug', 'name', 'client', 'industry', 'summary', 'description', 'url', 'image_url', 'accent', 'tech', 'status', 'featured', 'published', 'sort_order', 'launched_at'];

function toDbValue(key, value) {
  if (key === 'tech') return JSON.stringify(value ?? []);
  if (key === 'featured' || key === 'published') return value ? 1 : 0;
  return value ?? null;
}

export async function createProject(db, data) {
  const cols = WRITABLE.filter((k) => k in data);
  const row = await db
    .prepare(`INSERT INTO projects (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')}) RETURNING id`)
    .bind(...cols.map((k) => toDbValue(k, data[k])))
    .first();
  return row.id;
}

export async function updateProject(db, id, data) {
  const cols = WRITABLE.filter((k) => k in data);
  if (!cols.length) return;
  await db
    .prepare(
      `UPDATE projects SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(', ')},
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?${cols.length + 1}`,
    )
    .bind(...cols.map((k) => toDbValue(k, data[k])), id)
    .run();
}

export function deleteProject(db, id) {
  return db.prepare('DELETE FROM projects WHERE id = ?1').bind(id).run();
}
