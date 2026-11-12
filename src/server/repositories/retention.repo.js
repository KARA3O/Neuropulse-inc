/**
 * Data retention, run by the daily cron. Matches the privacy policy on /privacy:
 * enquiries are kept for up to 24 months, or longer for clients (status "won").
 */
const CUTOFF = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 months')`;

/** @returns {Promise<{ enquiries: number, calls: number, auditEntries: number }>} rows deleted */
export async function purgeOldRecords(db) {
  const [enquiries, calls, audit] = await db.batch([
    db.prepare(`DELETE FROM enquiries WHERE status != 'won' AND created_at < ${CUTOFF}`),
    db.prepare(`DELETE FROM call_bookings WHERE starts_at < ${CUTOFF}`),
    db.prepare(`DELETE FROM audit_log WHERE created_at < ${CUTOFF}`),
  ]);
  return { enquiries: enquiries.meta.changes ?? 0, calls: calls.meta.changes ?? 0, auditEntries: audit.meta.changes ?? 0 };
}
