/**
 * Crypto helpers built on Web Crypto (available in Workers and Node 18+).
 *
 * Passwords use PBKDF2-SHA256 with 100 000 iterations, which is the maximum Workers allows
 * and keeps a login comfortably inside the free plan's CPU budget. bcrypt/argon2 in pure JS
 * would exceed it.
 */

const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 100_000;

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** URL-safe random token (default 32 bytes = 256 bits). */
export function randomToken(bytes = 32) {
  return toB64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Human-friendly reference like NP-7K3QX2 or CALL-7K3QX2 (no 0/O/1/I to avoid confusion on the phone). */
export function referenceCode(prefix = 'NP') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-` + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** Returns "pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>". */
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${toB64(salt)}$${toB64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PBKDF2_ITERATIONS) return false;
  const bits = await pbkdf2(password, fromB64(parts[3]), iterations);
  return safeEqual(toB64(bits), parts[4]);
}

/** Salted hash of an IP so we can rate-limit without storing personal data. */
export async function hashIp(ip, salt) {
  return (await sha256Hex(`${salt || 'neuropulse-dev-salt'}:${ip}`)).slice(0, 32);
}
