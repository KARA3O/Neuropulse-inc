/**
 * Email notifications for new enquiries.
 *
 * Uses Resend (free tier: 3 000 emails/month) when RESEND_API_KEY is set. Without the key,
 * enquiries are still saved in D1 and visible in the admin dashboard; we just log instead.
 * Runs inside ctx.waitUntil() so the visitor never waits for email delivery.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[notify] RESEND_API_KEY not set; skipped email "${subject}" to ${to}`);
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) console.error('[notify] Resend error', res.status, await res.text());
  return { ok: res.ok };
}

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
  ];
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="color:#0B5FD6;margin:0 0 12px">New project enquiry</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="color:#555">${k}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}
      </table>
      <p style="white-space:pre-wrap;background:#F4F8FC;padding:12px;border-radius:8px">${esc(e.message)}</p>
      <p><a href="${esc(env.SITE_URL)}/admin">Open the dashboard</a></p>
    </div>`;
  return sendEmail(env, {
    to: env.NOTIFY_EMAIL,
    subject: `New enquiry ${e.reference}: ${e.service} from ${e.name}`,
    html,
    replyTo: e.email,
  });
}
