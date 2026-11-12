/**
 * Data access for discovery-call bookings.
 */

const isUniqueViolation = (err) => /UNIQUE|constraint/i.test(String(err && err.message));

/** Start times (UTC ISO) already held between two moments. */
export async function takenSlots(db, fromIso, toIso) {
  const { results } = await db
    .prepare(`SELECT starts_at FROM call_bookings WHERE status IN ('confirmed','completed','no_show') AND starts_at >= ?1 AND starts_at <= ?2`)
    .bind(fromIso, toIso)
    .all();
  return new Set(results.map((r) => r.starts_at));
}

/** @returns {Promise<boolean>} false when someone else took the slot a moment earlier */
export async function createCall(db, c) {
  try {
    await db
      .prepare(
        `INSERT INTO call_bookings (reference, starts_at, name, email, phone, company, topic, cancel_token, consent, ip_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(c.reference, c.starts_at, c.name, c.email, c.phone ?? null, c.company ?? null, c.topic ?? null, c.cancel_token, c.consent ? 1 : 0, c.ip_hash)
      .run();
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export function findCallByToken(db, token) {
  return db.prepare('SELECT * FROM call_bookings WHERE cancel_token = ?1').bind(token).first();
}

export function findCall(db, id) {
  return db.prepare('SELECT * FROM call_bookings WHERE id = ?1').bind(id).first();
}

export async function setCallStatus(db, id, status) {
  await db
    .prepare(`UPDATE call_bookings SET status = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?2`)
    .bind(status, id)
    .run();
}

/** Cancel only if it is still confirmed (so a second click does nothing). */
export function cancelCallBooking(db, id) {
  return db
    .prepare(`UPDATE call_bookings SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1 AND status = 'confirmed'`)
    .bind(id)
    .run();
}

export function deleteCall(db, id) {
  return db.prepare('DELETE FROM call_bookings WHERE id = ?1').bind(id).run();
}

/** Upcoming calls first (soonest at the top), then the most recent past ones. */
export async function listCalls(db) {
  const now = new Date().toISOString();
  const [upcoming, past] = await db.batch([
    db.prepare(`SELECT id, reference, starts_at, name, email, phone, company, topic, status FROM call_bookings WHERE starts_at >= ?1 ORDER BY starts_at ASC LIMIT 100`).bind(now),
    db.prepare(`SELECT id, reference, starts_at, name, email, phone, company, topic, status FROM call_bookings WHERE starts_at < ?1 ORDER BY starts_at DESC LIMIT 30`).bind(now),
  ]);
  return { upcoming: upcoming.results, past: past.results };
}

export async function countUpcoming(db) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM call_bookings WHERE status = 'confirmed' AND starts_at >= ?1`)
    .bind(new Date().toISOString())
    .first();
  return row ? row.n : 0;
}
