/**
 * Time-based one-time passwords (RFC 6238), for admin two-factor sign-in.
 * Works with Google Authenticator, Microsoft Authenticator, Authy and 1Password.
 * Built on Web Crypto, so it runs in Workers and Node with no dependencies.
 */
import { safeEqual } from './crypto.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Not a valid base32 secret.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A fresh 160-bit secret, as the base32 text people type into an authenticator app. */
export function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hotp(keyBytes, counter, digits) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The code an authenticator app shows at the given time (default: now). */
export async function totpAt(secret, timeMs = Date.now(), { digits = 6, step = 30 } = {}) {
  return hotp(base32Decode(secret), Math.floor(timeMs / 1000 / step), digits);
}

/**
 * True when `code` matches the current code or the one just before / after it
 * (so a phone clock that is a few seconds off still works).
 */
export async function verifyTotp(secret, code, timeMs = Date.now(), { window = 1, digits = 6, step = 30 } = {}) {
  const given = String(code || '').replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(given)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / step);
  let ok = false;
  for (let i = -window; i <= window; i++) {
    if (safeEqual(await hotp(key, counter + i, digits), given)) ok = true; // no early exit: constant work
  }
  return ok;
}

/** otpauth:// link that authenticator apps understand (also what a QR code would contain). */
export function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
