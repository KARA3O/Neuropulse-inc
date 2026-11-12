/**
 * Public API: used by the website itself, no login needed.
 *
 *   GET  /api/health                 uptime + database check
 *   GET  /api/config                 public client config (Turnstile site key, form options)
 *   GET  /api/projects               published showcase projects
 *   GET  /api/projects/:slug         one published project
 *   GET  /api/testimonials           published client quotes
 *   POST /api/enquiries              "Start a project" form (also sends the visitor an automatic reply)
 *   GET  /api/calls/slots            open discovery-call times for the next two weeks
 *   POST /api/calls                  book a discovery call
 *   GET  /api/calls/cancel?token=    page with a "cancel this call" button (from the confirmation email)
 *   POST /api/calls/cancel           cancels the call
 *   POST /api/subscribe              updates list sign-up
 *   GET  /api/unsubscribe?token=...  one-click unsubscribe (returns a small HTML page)
 */
import { cachedJson, clientIp, HttpError, json, readJson } from '../lib/http.js';
import { BUDGETS, callSchema, enquirySchema, HEARD_FROM, SERVICES, subscribeSchema, TIMELINES, validate } from '../lib/validate.js';
import { hashIp, randomToken, referenceCode } from '../lib/crypto.js';
import { BOOKING, formatSlot, generateDays, isOfferedSlot, parseBlockedDates } from '../lib/booking.js';
import { enforceRateLimit } from '../middleware/rate-limit.js';
import { cancelCallBooking, createCall, findCallByToken, takenSlots } from '../repositories/calls.repo.js';
import { createEnquiry } from '../repositories/enquiries.repo.js';
import { findPublishedBySlug, listPublished } from '../repositories/projects.repo.js';
import { unsubscribe, upsertSubscriber } from '../repositories/subscribers.repo.js';
import { listPublishedTestimonials } from '../repositories/testimonials.repo.js';
import { esc, isSandboxSender, notifyCallBooked, notifyCallCancelled, notifyEnquiryReceived, notifyNewEnquiry } from '../services/notify.service.js';
import { verifyTurnstile } from '../services/turnstile.service.js';

/** Small branded HTML page for the links people open from emails. */
function htmlPage(title, bodyHtml, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Neuropulse Inc.</title><body style="font-family:system-ui,Arial,sans-serif;background:#0A0C10;color:#F4F8FC;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><main style="max-width:440px"><h1 style="font-size:24px;margin:0 0 16px">Neuro<span style="color:#1E9BFF">pulse</span> <small style="font-size:13px;font-weight:400;color:#8FA0B5">Inc.</small></h1>${bodyHtml}<p style="margin-top:28px"><a style="color:#1E9BFF" href="/">Back to the website</a></p></main>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

/** @param {import('../router.js').Router} r */
export function registerPublicRoutes(r) {
  r.get('/api/health', async ({ env }) => {
    const started = Date.now();
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, service: 'neuropulse-inc', db: 'up', dbLatencyMs: Date.now() - started, time: new Date().toISOString() });
  });

  r.get('/api/config', ({ env }) =>
    cachedJson({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, services: SERVICES, budgets: BUDGETS, timelines: TIMELINES, heardFrom: HEARD_FROM }, 300),
  );

  r.get('/api/projects', async ({ env }) => cachedJson({ ok: true, projects: await listPublished(env.DB) }, 60));

  r.get('/api/projects/:slug', async ({ env, params }) => {
    const project = await findPublishedBySlug(env.DB, params.slug);
    if (!project) throw new HttpError(404, 'That project is not available.');
    return cachedJson({ ok: true, project }, 60);
  });

  r.get('/api/testimonials', async ({ env }) => cachedJson({ ok: true, testimonials: await listPublishedTestimonials(env.DB) }, 60));

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
    // Alert to you, plus an automatic "we got it" email to the visitor. One failing never blocks the other.
    ctx.waitUntil(Promise.allSettled([notifyNewEnquiry(env, enquiry), notifyEnquiryReceived(env, enquiry)]));

    return json({ ok: true, reference: enquiry.reference }, 201);
  });

  // ---- Discovery calls ----------------------------------------------------------------------
  r.get('/api/calls/slots', async ({ env }) => {
    const now = Date.now();
    const days = generateDays(now, parseBlockedDates(env.BOOKING_BLOCKED_DATES));
    if (!days.length) return json({ ok: true, days: [], timezone: BOOKING.timezone, timezoneLabel: BOOKING.timezoneLabel, slotMinutes: BOOKING.slotMinutes });

    const taken = await takenSlots(env.DB, days[0].slots[0], days.at(-1).slots.at(-1));
    const open = days.map((d) => ({ date: d.date, slots: d.slots.filter((s) => !taken.has(s)) })).filter((d) => d.slots.length);
    return json({ ok: true, days: open, timezone: BOOKING.timezone, timezoneLabel: BOOKING.timezoneLabel, slotMinutes: BOOKING.slotMinutes });
  });

  r.post('/api/calls', async (ctx) => {
    const { request, env } = ctx;
    const body = await readJson(request);
    if (body.website) return json({ ok: true, reference: referenceCode('CALL') }, 201); // honeypot

    const ip = clientIp(request);
    const ipHash = await hashIp(ip, env.IP_SALT);
    await enforceRateLimit(env.DB, 'call', ipHash);
    await verifyTurnstile(env, body.turnstileToken, ip);

    const data = validate(body, callSchema);
    if (!data.consent) throw new HttpError(422, 'Please fix the highlighted fields.', { consent: 'Tick the box so we may use your details to contact you.' });

    const taken = 'That time is no longer available. Please choose another.';
    if (!isOfferedSlot(data.slot, Date.now(), parseBlockedDates(env.BOOKING_BLOCKED_DATES))) throw new HttpError(409, taken, { slot: taken });

    const call = { ...data, starts_at: data.slot, reference: referenceCode('CALL'), cancel_token: randomToken(24), ip_hash: ipHash };
    if (!(await createCall(env.DB, call))) throw new HttpError(409, 'Someone just booked that time. Please choose another.', { slot: 'Someone just booked that time. Please choose another.' });

    ctx.waitUntil(Promise.allSettled([notifyCallBooked(env, call)]));
    // Tell the page honestly whether a confirmation email will reach the visitor (it will not while
    // MAIL_FROM is still the Resend test sender).
    const confirmationEmail = !!env.RESEND_API_KEY && !isSandboxSender(env);
    return json({ ok: true, reference: call.reference, starts_at: call.starts_at, label: formatSlot(call.starts_at), timezoneLabel: BOOKING.timezoneLabel, confirmationEmail }, 201);
  });

  // The cancel link in the confirmation email opens a page with a button. Cancelling needs a click
  // (a POST), so email scanners that pre-open links cannot cancel a call by accident.
  r.get('/api/calls/cancel', async ({ env, url }) => {
    const token = url.searchParams.get('token') || '';
    const call = token.length > 10 ? await findCallByToken(env.DB, token) : null;
    if (!call || call.status !== 'confirmed') return htmlPage('Cancel call', '<p>That cancel link is not valid, or the call was already cancelled.</p>', 404);
    return htmlPage(
      'Cancel call',
      `<p>Cancel your call with Neuropulse on <strong>${esc(formatSlot(call.starts_at))}</strong> , ${esc(BOOKING.timezoneLabel)}?</p>
       <form method="post" action="/api/calls/cancel"><input type="hidden" name="token" value="${esc(token)}"><button style="background:#1E9BFF;color:#0A0C10;border:0;border-radius:999px;padding:12px 24px;font-size:16px;font-weight:600;cursor:pointer">Yes, cancel the call</button></form>`,
    );
  });

  r.post('/api/calls/cancel', async ({ request, env, waitUntil }) => {
    await enforceRateLimit(env.DB, 'call', await hashIp(clientIp(request), env.IP_SALT));
    let token = '';
    try {
      token = String((await request.formData()).get('token') || '');
    } catch {
      /* not a form post: fall through to "not valid" */
    }
    const call = token.length > 10 ? await findCallByToken(env.DB, token) : null;
    if (!call || call.status !== 'confirmed') return htmlPage('Cancel call', '<p>That cancel link is not valid, or the call was already cancelled.</p>', 404);
    await cancelCallBooking(env.DB, call.id);
    waitUntil(notifyCallCancelled(env, call));
    return htmlPage('Call cancelled', '<p>Your call has been cancelled and the time is free again. Book another time whenever suits you.</p>');
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
