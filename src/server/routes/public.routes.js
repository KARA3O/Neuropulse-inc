/**
 * Public API: used by the website itself, no login needed.
 *
 *   GET  /api/health                 uptime + database check
 *   GET  /api/config                 public client config (Turnstile site key, form options)
 *   GET  /api/projects               published showcase projects
 *   GET  /api/projects/:slug         one published project
 *   POST /api/enquiries              "Start a project" form
 *   POST /api/subscribe              updates list sign-up
 *   GET  /api/unsubscribe?token=...  one-click unsubscribe (returns a small HTML page)
 */
import { cachedJson, clientIp, HttpError, json, readJson } from '../lib/http.js';
import { BUDGETS, enquirySchema, SERVICES, subscribeSchema, TIMELINES, validate } from '../lib/validate.js';
import { hashIp, randomToken, referenceCode } from '../lib/crypto.js';
import { enforceRateLimit } from '../middleware/rate-limit.js';
import { createEnquiry } from '../repositories/enquiries.repo.js';
import { findPublishedBySlug, listPublished } from '../repositories/projects.repo.js';
import { unsubscribe, upsertSubscriber } from '../repositories/subscribers.repo.js';
import { notifyNewEnquiry } from '../services/notify.service.js';
import { verifyTurnstile } from '../services/turnstile.service.js';

/** @param {import('../router.js').Router} r */
export function registerPublicRoutes(r) {
  r.get('/api/health', async ({ env }) => {
    const started = Date.now();
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, service: 'neuropulse-inc', db: 'up', dbLatencyMs: Date.now() - started, time: new Date().toISOString() });
  });

  r.get('/api/config', ({ env }) =>
    cachedJson({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, services: SERVICES, budgets: BUDGETS, timelines: TIMELINES }, 300),
  );

  r.get('/api/projects', async ({ env }) => cachedJson({ ok: true, projects: await listPublished(env.DB) }, 60));

  r.get('/api/projects/:slug', async ({ env, params }) => {
    const project = await findPublishedBySlug(env.DB, params.slug);
    if (!project) throw new HttpError(404, 'That project is not available.');
    return cachedJson({ ok: true, project }, 60);
  });

  r.get('/media/projects/:filename', async ({ env, params }) => {
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\.(?:jpg|png|webp)$/i.test(params.filename)) {
      throw new HttpError(404, 'That image does not exist.');
    }
    if (!env.PROJECT_IMAGES) throw new HttpError(503, 'Project image storage is not configured. Check the R2 binding.');
    const image = await env.PROJECT_IMAGES.get(`projects/${params.filename}`);
    if (!image) throw new HttpError(404, 'That image does not exist.');
    const headers = new Headers();
    image.writeHttpMetadata(headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('etag', image.httpEtag);
    headers.set('x-content-type-options', 'nosniff');
    return new Response(image.body, { headers });
  });

  r.post('/api/enquiries', async (ctx) => {
    const { request, env } = ctx;
    const body = await readJson(request);

    // Honeypot: real people never see or fill the "website" field. Pretend success for bots.
    if (body.website) return json({ ok: true, reference: referenceCode() }, 201);

    const ip = clientIp(request);
    const ipHash = await hashIp(ip, env.IP_SALT);
    await enforceRateLimit(env.DB, 'enquiry', ipHash);
    await verifyTurnstile(env, body.turnstileToken, ip);

    const data = validate(body, enquirySchema);
    if (!data.consent) throw new HttpError(422, 'Please fix the highlighted fields.', { consent: 'Tick the box so we may use your details to reply.' });

    const enquiry = { ...data, reference: referenceCode(), ip_hash: ipHash };
    await createEnquiry(env.DB, enquiry);
    ctx.waitUntil(notifyNewEnquiry(env, enquiry));

    return json({ ok: true, reference: enquiry.reference }, 201);
  });

  r.post('/api/subscribe', async ({ request, env }) => {
    const body = await readJson(request, 2048);
    if (body.website) return json({ ok: true }, 201);
    await enforceRateLimit(env.DB, 'subscribe', await hashIp(clientIp(request), env.IP_SALT));
    const { email } = validate(body, subscribeSchema);
    await upsertSubscriber(env.DB, email.toLowerCase(), randomToken(24));
    return json({ ok: true }, 201);
  });

  r.get('/api/unsubscribe', async ({ env, url }) => {
    const token = url.searchParams.get('token') || '';
    const done = token.length > 10 && (await unsubscribe(env.DB, token));
    const msg = done ? 'You have been unsubscribed. You will not get any more updates from us.' : 'That unsubscribe link is not valid or was already used.';
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe | Neuropulse Inc.</title><body style="font-family:system-ui;background:#0A0C10;color:#F4F8FC;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><main style="max-width:420px"><h1 style="font-size:24px">Neuropulse Inc.</h1><p>${msg}</p><p><a style="color:#1E9BFF" href="/">Back to the website</a></p></main>`,
      { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
    );
  });
}
