/**
 * Email for the website: alerts to the owner, plus confirmations to visitors.
 *
 * Uses Resend (free tier: 3 000 emails/month) when RESEND_API_KEY is set. Without the key, data is
 * still saved in D1 and visible in the admin dashboard; we just log instead.
 * Everything runs inside ctx.waitUntil() so the visitor never waits for email delivery.
 *
 * IMPORTANT: while MAIL_FROM is the Resend test sender (onboarding@resend.dev), Resend only delivers
 * to the account owner's own address. So owner alerts work, but emails to visitors are skipped until
 * you verify your own domain in Resend and change MAIL_FROM (see docs/DEPLOYMENT.md).
 */
import { BOOKING, formatSlot } from '../lib/booking.js';
import { buildIcs } from '../lib/ics.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** True while mail can only reach the Resend account owner. */
export const isSandboxSender = (env) => /@resend\.dev>?\s*$/i.test(env.MAIL_FROM || '');

const toBase64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

async function sendEmail(env, { to, subject, html, replyTo, attachments }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[notify] RESEND_API_KEY not set; skipped email "${subject}" to ${to}`);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(attachments ? { attachments } : {}) }),
  });
  if (!res.ok) console.error('[notify] Resend error', res.status, await res.text());
  return { ok: res.ok };
}

/** Email to a visitor: skipped (and logged) while only the Resend test sender is configured. */
function sendToVisitor(env, message) {
  if (isSandboxSender(env)) {
    console.log(`[notify] visitor email "${message.subject}" skipped: MAIL_FROM is the Resend test sender. Verify your domain in Resend to enable it.`);
    return Promise.resolve({ skipped: true, reason: 'sandbox-sender' });
  }
  return sendEmail(env, message);
}

// ---- Branded layout (same colours as the website) ----------------------------------------------
const C = { ink: '#0A0C10', pulse: '#1E9BFF', deep: '#0B5FD6', steel: '#8FA0B5', paper: '#F4F8FC', text: '#0A0C10', muted: '#4A5869' };

function layout(env, { heading, body }) {
  const site = esc(env.SITE_URL || '');
  return `<!doctype html><html><body style="margin:0;background:${C.paper};font-family:Arial,Helvetica,sans-serif;color:${C.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #D3DDE9">
      <tr><td style="background:${C.ink};padding:22px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:12px"><img src="${site}/assets/brand/site-icon-512.png" width="40" height="40" alt="" style="display:block;border-radius:8px"></td>
          <td style="font-size:24px;font-weight:bold;color:#F4F8FC;letter-spacing:-0.5px">Neuro<span style="color:${C.pulse}">pulse</span> <span style="font-size:13px;font-weight:normal;color:${C.steel}">Inc.</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${C.text}">${esc(heading)}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:18px 28px;background:${C.paper};color:${C.muted};font-size:12px;line-height:1.5">
        Neuropulse Inc. &middot; Limpopo, South Africa &middot; ${esc(env.PHONE_DISPLAY || '')}<br>
        Smarter Technology. Brighter Futures.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

const p = (html) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.text}">${html}</p>`;
const button = (href, label, bg = C.pulse, fg = C.ink) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:999px;margin:4px 8px 4px 0">${esc(label)}</a>`;
const box = (html) => `<div style="background:${C.paper};border-left:4px solid ${C.pulse};border-radius:6px;padding:14px 16px;margin:0 0 18px;font-size:14px;line-height:1.6">${html}</div>`;
const table = (rows) =>
  `<table cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="color:${C.muted};vertical-align:top">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`)
    .join('')}</table>`;

function whatsappLink(env, text) {
  const base = env.WHATSAPP_URL || 'https://wa.me/27727216200';
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Turn the estimator's saved choices into one readable line. */
export function describeSelection(json) {
  if (!json) return '';
  try {
    const s = JSON.parse(json);
    return [s.type, s.pages, ...(Array.isArray(s.extras) ? s.extras : [])].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

// ---- 1. New enquiry: alert to the owner --------------------------------------------------------
export function notifyNewEnquiry(env, e) {
  const rows = [
    ['Reference', e.reference],
    ['Name', e.name],
    ['Email', e.email],
    ['Phone', e.phone || '—'],
    ['Company', e.company || '—'],
    ['Service', e.service],
    ['Budget', e.budget || '—'],
    ['Timeline', e.timeline || '—'],
    ['Prefers', e.contact_pref],
    ['Heard about us', e.heard_from || e.utm_source || '—'],
    ...(e.quote_selection ? [['Estimate chosen', describeSelection(e.quote_selection) || '—']] : []),
  ];
  const html = layout(env, {
    heading: 'New project enquiry',
    body:
      table(rows) +
      `<p style="white-space:pre-wrap;background:${C.paper};padding:12px;border-radius:8px;font-size:14px;line-height:1.5">${esc(e.message)}</p>` +
      button(`${env.SITE_URL}/admin#enquiries`, 'Open the dashboard', C.deep, '#ffffff'),
  });
  return sendEmail(env, {
    to: env.NOTIFY_EMAIL,
    subject: `New enquiry ${e.reference}: ${e.service} from ${e.name}`,
    html,
    replyTo: e.email,
  });
}

// ---- 2. New enquiry: automatic reply to the visitor --------------------------------------------
export function notifyEnquiryReceived(env, e) {
  const first = String(e.name).split(' ')[0];
  const way = { email: 'by email', whatsapp: 'on WhatsApp', phone: 'by phone' }[e.contact_pref] || 'by email';
  const estimate = describeSelection(e.quote_selection);
  const html = layout(env, {
    heading: `Thanks ${first}, we have your enquiry`,
    body:
      p(`Your reference is <strong style="color:${C.deep}">${esc(e.reference)}</strong>. We will reply ${esc(way)} within one business day with questions or a fixed quote.`) +
      box(`<strong>What you asked for</strong><br>${esc(e.service)}${estimate ? `<br>Estimate you built: ${esc(estimate)}` : ''}${e.timeline ? `<br>Timeline: ${esc(e.timeline)}` : ''}`) +
      p('Need an answer sooner? Message us on WhatsApp with your reference, or pick a time for a free 30-minute call.') +
      `<p style="margin:8px 0 4px">${button(whatsappLink(env, `Hi Neuropulse, my enquiry reference is ${e.reference}.`), 'WhatsApp us', '#25D366', '#0A0C10')}${button(`${env.SITE_URL}/#book`, 'Book a free call', C.deep, '#ffffff')}</p>` +
      p(`<span style="color:${C.muted};font-size:13px">You are getting this email because you sent the project form on ${esc(env.SITE_URL)}. Your details are used only to reply to you, as set out in our <a href="${esc(env.SITE_URL)}/privacy" style="color:${C.deep}">privacy policy</a>.</span>`),
  });
  return sendToVisitor(env, { to: e.email, subject: `We got your enquiry (${e.reference})`, html, replyTo: env.NOTIFY_EMAIL });
}

// ---- 3. Discovery call booked ------------------------------------------------------------------
export function notifyCallBooked(env, c) {
  const when = formatSlot(c.starts_at);
  const first = String(c.name).split(' ')[0];
  const cancelUrl = `${env.SITE_URL}/api/calls/cancel?token=${encodeURIComponent(c.cancel_token)}`;
  const ics = buildIcs({
    uid: `${c.reference}@neuropulse`,
    startsAt: c.starts_at,
    minutes: BOOKING.slotMinutes,
    summary: 'Free call with Neuropulse Inc.',
    description: `Your free 30-minute discovery call with Neuropulse Inc. Reference ${c.reference}. We will phone or WhatsApp you on the number you gave. To cancel: ${cancelUrl}`,
    organizerEmail: env.NOTIFY_EMAIL,
    organizerName: 'Neuropulse Inc.',
    attendeeEmail: c.email,
    attendeeName: c.name,
    url: env.SITE_URL,
  });

  const visitorHtml = layout(env, {
    heading: `You're booked, ${first}`,
    body:
      box(`<strong style="font-size:17px">${esc(when)}</strong><br>${esc(BOOKING.timezoneLabel)} &middot; ${BOOKING.slotMinutes} minutes<br>Reference ${esc(c.reference)}`) +
      p(c.phone ? `We will call or WhatsApp you on <strong>${esc(c.phone)}</strong> at that time.` : 'We will email you a few minutes before the call to agree how to connect (phone or WhatsApp).') +
      p('Add the call to your calendar with the attached file. It helps to have a rough idea of what you want built, who it is for, and your timeline.') +
      p(`<span style="color:${C.muted};font-size:13px">Cannot make it? <a href="${esc(cancelUrl)}" style="color:${C.deep}">Cancel or free up this time</a>, then pick another from the website.</span>`),
  });
  const ownerHtml = layout(env, {
    heading: 'New discovery call booked',
    body:
      box(`<strong style="font-size:17px">${esc(when)}</strong><br>${esc(BOOKING.timezoneLabel)}`) +
      table([['Reference', c.reference], ['Name', c.name], ['Email', c.email], ['Phone', c.phone || '—'], ['Company', c.company || '—'], ['Wants to talk about', c.topic || '—']]) +
      `<p style="margin-top:16px">${button(`${env.SITE_URL}/admin#calls`, 'Open the dashboard', C.deep, '#ffffff')}</p>`,
  });

  const attachments = [{ filename: 'neuropulse-call.ics', content: toBase64(ics) }];
  return Promise.all([
    sendToVisitor(env, { to: c.email, subject: `Your call with Neuropulse: ${when}`, html: visitorHtml, replyTo: env.NOTIFY_EMAIL, attachments }),
    sendEmail(env, { to: env.NOTIFY_EMAIL, subject: `Call booked: ${c.name}, ${when}`, html: ownerHtml, replyTo: c.email, attachments }),
  ]);
}

export function notifyCallCancelled(env, c) {
  const html = layout(env, {
    heading: 'A discovery call was cancelled',
    body: box(`<strong>${esc(formatSlot(c.starts_at))}</strong><br>${esc(c.name)} (${esc(c.email)}) &middot; ${esc(c.reference)}<br>That time is open again on the website.`),
  });
  return sendEmail(env, { to: env.NOTIFY_EMAIL, subject: `Call cancelled: ${c.name}`, html });
}

// ---- 4. Error alert to the owner ---------------------------------------------------------------
export function notifyServerError(env, { method, path, message, stack }) {
  const html = layout(env, {
    heading: 'The website hit a server error',
    body:
      p('A visitor request failed with a 500 error. Only one alert is sent every 15 minutes, so more failures may have followed.') +
      table([['Request', `${method} ${path}`], ['Error', message || 'Unknown'], ['Time', new Date().toISOString()]]) +
      `<pre style="white-space:pre-wrap;word-break:break-word;background:${C.paper};padding:12px;border-radius:8px;font-size:12px;line-height:1.5">${esc((stack || '').split('\n').slice(0, 6).join('\n'))}</pre>` +
      p('See the full log with <code>npm run logs</code>.'),
  });
  return sendEmail(env, { to: env.NOTIFY_EMAIL, subject: `Neuropulse website error: ${method} ${path}`, html });
}
