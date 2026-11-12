/**
 * Data access for project enquiries and dashboard statistics.
 */

export async function createEnquiry(db, e) {
  return db
    .prepare(
      `INSERT INTO enquiries
        (reference, name, email, phone, company, service, budget, timeline, message, contact_pref, consent, source_page, ip_hash,
         heard_from, utm_source, utm_medium, utm_campaign, quote_selection)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    )
    .bind(
      e.reference, e.name, e.email, e.phone, e.company, e.service, e.budget, e.timeline, e.message, e.contact_pref, e.consent ? 1 : 0, e.source_page, e.ip_hash,
      e.heard_from ?? null, e.utm_source ?? null, e.utm_medium ?? null, e.utm_campaign ?? null, e.quote_selection ?? null,
    )
    .run();
}

/**
 * @param {{ status?: string, q?: string, limit?: number, offset?: number }} f
 */
export async function listEnquiries(db, f = {}) {
  const where = [];
  const binds = [];
  if (f.status) { binds.push(f.status); where.push(`status = ?${binds.length}`); }
  if (f.q) {
    binds.push(`%${f.q}%`);
    const n = binds.length;
    where.push(`(name LIKE ?${n} OR email LIKE ?${n} OR company LIKE ?${n} OR reference LIKE ?${n})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(f.limit || 25, 1), 100);
  const offset = Math.max(f.offset || 0, 0);

  const [list, count] = await db.batch([
    db
      .prepare(
        `SELECT id, reference, name, email, phone, company, service, budget, timeline, status, contact_pref, heard_from, utm_source, created_at
           FROM enquiries ${clause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      )
      .bind(...binds),
    db.prepare(`SELECT COUNT(*) AS total FROM enquiries ${clause}`).bind(...binds),
  ]);
  return { items: list.results, total: count.results[0].total, limit, offset };
}

export function findEnquiry(db, id) {
  return db.prepare('SELECT * FROM enquiries WHERE id = ?1').bind(id).first();
}

export async function updateEnquiry(db, id, data) {
  const cols = ['status', 'notes'].filter((k) => k in data);
  if (!cols.length) return;
  await db
    .prepare(`UPDATE enquiries SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?${cols.length + 1}`)
    .bind(...cols.map((k) => data[k]), id)
    .run();
}

export function deleteEnquiry(db, id) {
  return db.prepare('DELETE FROM enquiries WHERE id = ?1').bind(id).run();
}

export async function exportEnquiries(db) {
  const { results } = await db
    .prepare('SELECT reference, created_at, status, name, email, phone, company, service, budget, timeline, contact_pref, heard_from, utm_source, utm_medium, utm_campaign, quote_selection, message, notes FROM enquiries ORDER BY created_at DESC')
    .all();
  return results;
}

/** Numbers for the dashboard overview, in one round trip. */
export async function dashboardStats(db) {
  const [byStatus, week, month, projects, subs, daily, sources] = await db.batch([
    db.prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status'),
    db.prepare(`SELECT COUNT(*) AS n FROM enquiries WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`),
    db.prepare(`SELECT COUNT(*) AS n FROM enquiries WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')`),
    db.prepare('SELECT status, published, COUNT(*) AS n FROM projects GROUP BY status, published'),
    db.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE status = 'active'`),
    db.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM enquiries
        WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-13 days')
        GROUP BY day ORDER BY day`,
    ),
    // Where enquiries come from (last 90 days): the answer to "How did you hear about us?",
    // or the utm_source of the link they followed when they did not answer.
    db.prepare(
      `SELECT COALESCE(heard_from, utm_source, 'Not answered') AS source, COUNT(*) AS n FROM enquiries
        WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')
        GROUP BY source ORDER BY n DESC LIMIT 8`,
    ),
  ]);
  const statusCounts = Object.fromEntries(byStatus.results.map((r) => [r.status, r.n]));
  const won = statusCounts.won || 0;
  const closed = won + (statusCounts.lost || 0);
  return {
    enquiries: {
      byStatus: statusCounts,
      total: byStatus.results.reduce((s, r) => s + r.n, 0),
      last7Days: week.results[0].n,
      last30Days: month.results[0].n,
      winRate: closed ? Math.round((won / closed) * 100) : null,
      daily: daily.results,
      sources: sources.results,
    },
    projects: {
      live: projects.results.filter((r) => r.status === 'live' && r.published).reduce((s, r) => s + r.n, 0),
      published: projects.results.filter((r) => r.published).reduce((s, r) => s + r.n, 0),
      drafts: projects.results.filter((r) => !r.published).reduce((s, r) => s + r.n, 0),
    },
    subscribers: subs.results[0].n,
  };
}
