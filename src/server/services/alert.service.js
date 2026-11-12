/**
 * Emails the owner when the website throws an unexpected (500) error.
 * At most one email per 15 minutes, so a broken page cannot flood the inbox.
 * Never includes visitor details: only the request path (without query), the error message and a short stack.
 */
import { notifyServerError } from './notify.service.js';

const WINDOW = 900; // seconds

export async function alertServerError(env, request, err) {
  try {
    if (!env.DB || !env.RESEND_API_KEY) return;
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES ('alert:5xx', ?1, 1)
         ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`,
      )
      .bind(now - (now % WINDOW))
      .first();
    if (!row || row.count > 1) return;

    const { pathname } = new URL(request.url);
    await notifyServerError(env, {
      method: request.method,
      path: pathname,
      message: err && err.message ? String(err.message).slice(0, 300) : String(err).slice(0, 300),
      stack: err && err.stack ? String(err.stack) : '',
    });
  } catch (alertErr) {
    console.error('Could not send error alert', alertErr);
  }
}
