/**
 * Data access for admins, sessions and the audit log.
 */

export function findAdminByEmail(db, email) {
  return db.prepare('SELECT id, email, name, password_hash FROM admins WHERE email = ?1').bind(email).first();
}

export function findSessionAdmin(db, tokenHash) {
  return db
    .prepare(
      `SELECT a.id, a.email, a.name, s.expires_at
         FROM sessions s JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ?1 AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
    .bind(tokenHash)
    .first();
}

export function createSession(db, tokenHash, adminId, expiresAt) {
  return db.batch([
    db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?1, ?2, ?3)').bind(tokenHash, adminId, expiresAt),
    db.prepare(`UPDATE admins SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1`).bind(adminId),
  ]);
}

export function deleteSession(db, tokenHash) {
  return db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
}

export function purgeExpiredSessions(db) {
  return db.prepare(`DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run();
}

export function audit(db, adminId, action, entity, entityId) {
  return db
    .prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?1, ?2, ?3, ?4)')
    .bind(adminId ?? null, action, entity ?? null, entityId != null ? String(entityId) : null)
    .run();
}

export async function recentAudit(db, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT l.action, l.entity, l.entity_id, l.created_at, a.name AS admin_name
         FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id
        ORDER BY l.created_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all();
  return results;
}
