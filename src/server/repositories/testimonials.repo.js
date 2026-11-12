/**
 * Data access for client testimonials.
 */

const PUBLIC_SQL = `
  SELECT t.author_name, t.author_role, t.quote, p.slug AS project_slug, p.name AS project_name
    FROM testimonials t LEFT JOIN projects p ON p.id = t.project_id
   WHERE t.published = 1`;

const toPublic = (r) => r;
const toRow = (r) => (r ? { ...r, published: r.published === 1 } : null);

export async function listPublishedTestimonials(db) {
  const { results } = await db.prepare(`${PUBLIC_SQL} ORDER BY t.sort_order ASC, t.id ASC LIMIT 12`).all();
  return results.map(toPublic);
}

/** Published quotes about one project (for its case-study page). */
export async function listForProjectSlug(db, slug) {
  const { results } = await db.prepare(`${PUBLIC_SQL} AND p.slug = ?1 ORDER BY t.sort_order ASC, t.id ASC LIMIT 3`).bind(slug).all();
  return results.map(toPublic);
}

export async function listAllTestimonials(db) {
  const { results } = await db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM testimonials t LEFT JOIN projects p ON p.id = t.project_id
        ORDER BY t.sort_order ASC, t.id ASC`,
    )
    .all();
  return results.map(toRow);
}

export async function findTestimonial(db, id) {
  return toRow(await db.prepare('SELECT * FROM testimonials WHERE id = ?1').bind(id).first());
}

const WRITABLE = ['author_name', 'author_role', 'quote', 'project_id', 'published', 'sort_order'];
const toDb = (k, v) => (k === 'published' ? (v ? 1 : 0) : v ?? null);

export async function createTestimonial(db, data) {
  const cols = WRITABLE.filter((k) => k in data);
  const row = await db
    .prepare(`INSERT INTO testimonials (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')}) RETURNING id`)
    .bind(...cols.map((k) => toDb(k, data[k])))
    .first();
  return row.id;
}

export async function updateTestimonial(db, id, data) {
  const cols = WRITABLE.filter((k) => k in data);
  if (!cols.length) return;
  await db
    .prepare(`UPDATE testimonials SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(', ')} WHERE id = ?${cols.length + 1}`)
    .bind(...cols.map((k) => toDb(k, data[k])), id)
    .run();
}

export function deleteTestimonial(db, id) {
  return db.prepare('DELETE FROM testimonials WHERE id = ?1').bind(id).run();
}
