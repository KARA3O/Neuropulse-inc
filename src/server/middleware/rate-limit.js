/**
 * Fixed-window rate limiter stored in D1.
 * One UPSERT per check, so it costs a single row write per request.
 */
import { HttpError } from '../lib/http.js';

/** Limits per action: max requests per window (seconds). */
export const LIMITS = {
  enquiry: { max: 5, window: 3600 },     // 5 project enquiries per hour per visitor
  subscribe: { max: 5, window: 3600 },
  login: { max: 8, window: 900 },        // 8 login attempts per 15 minutes
};

/**
 * @param {D1Database} db
 * @param {keyof LIMITS} action
 * @param {string} identity hashed IP (or other identifier)
 */
export async function enforceRateLimit(db, action, identity) {
  const { max, window } = LIMITS[action];
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % window);
  const key = `${action}:${identity}`;

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first();

  if (row && row.count > max) {
    const retryMinutes = Math.ceil((windowStart + window - now) / 60);
    throw new HttpError(429, `Too many attempts. Please try again in about ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`);
  }
}

/** Housekeeping: delete windows older than a day. */
export function purgeRateLimits(db) {
  const cutoff = Math.floor(Date.now() / 1000) - 86_400;
  return db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(cutoff).run();
}
