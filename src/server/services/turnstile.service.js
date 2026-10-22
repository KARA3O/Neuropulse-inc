/**
 * Cloudflare Turnstile bot check (free, privacy-friendly CAPTCHA alternative).
 * Optional: only enforced when TURNSTILE_SECRET_KEY is configured.
 */
import { HttpError } from '../lib/http.js';

export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return; // not configured: honeypot + rate limit still apply
  if (!token) throw new HttpError(400, 'Please complete the "I am human" check.');

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new HttpError(400, 'The human check failed. Refresh the page and try again.');
}
