/**
 * Admin authentication via an HttpOnly session cookie.
 * The cookie holds a random token; D1 stores only its SHA-256 hash, so a database leak
 * does not leak usable sessions.
 */
import { HttpError } from '../lib/http.js';
import { sha256Hex } from '../lib/crypto.js';
import { findSessionAdmin } from '../repositories/admins.repo.js';

export const SESSION_COOKIE = 'np_session';
export const SESSION_DAYS = 7;

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token, url, maxAgeSeconds) {
  // "Secure" is dropped on http://localhost so local testing works.
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Resolve the logged-in admin or throw 401. */
export async function requireAdmin(ctx) {
  const token = readCookie(ctx.request, SESSION_COOKIE);
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  const admin = await findSessionAdmin(ctx.env.DB, await sha256Hex(token));
  if (!admin) throw new HttpError(401, 'Your session has ended. Sign in again.');
  ctx.admin = admin;
  return admin;
}
