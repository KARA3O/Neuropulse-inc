/**
 * Data access for the newsletter / updates list.
 */
/** Insert, or re-activate an unsubscribed address. Returns true if newly active. */
export async function upsertSubscriber(db, email, token) {
  const row = await db
    .prepare(
      `INSERT INTO subscribers (email, unsubscribe_token) VALUES (?1, ?2)
       ON CONFLICT (email) DO UPDATE SET status = 'active'
       RETURNING id`,
    )
    .bind(email, token)
    .first();
  return !!row;
}

export async function unsubscribe(db, token) {
  const r = await db.prepare(`UPDATE subscribers SET status = 'unsubscribed' WHERE unsubscribe_token = ?1`).bind(token).run();
  return r.meta.changes > 0;
}

export async function listSubscribers(db) {
  const { results } = await db.prepare('SELECT id, email, status, created_at FROM subscribers ORDER BY created_at DESC LIMIT 1000').all();
  return results;
}
