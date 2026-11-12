# Security and privacy

## Threat model (what we defend against)

| Threat | Control | Where |
|---|---|---|
| Spam and bots on forms | Honeypot field, D1 rate limits (5/hour), optional Turnstile | `public.routes.js`, `rate-limit.js`, `turnstile.service.js` |
| Password guessing on `/admin` | Login rate limit (8 per 15 minutes), PBKDF2 100k iterations, same error and timing for unknown emails | `admin.routes.js`, `auth.service.js` |
| Stolen database leaks sessions or passwords | Only `sha256(token)` stored for sessions; passwords salted and hashed | `crypto.js`, `auth.js` |
| Cross-site request forgery | `SameSite=Strict` cookie and an `Origin` check on every unsafe method | `security.js` |
| Cross-site scripting | All dynamic text escaped before insertion; strict CSP (`script-src 'self'`); session cookie is HttpOnly | `api.js → escapeHtml`, `_headers` |
| SQL injection | Prepared statements with bound parameters only; column names are whitelisted | `repositories/*` |
| Clickjacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | `_headers` |
| Malicious project links | URLs must be `http(s)`; showcase links use `rel="noopener noreferrer"` | `validate.js`, `work.js` |
| CSV formula injection in exports | Cells starting with `= + - @` are prefixed with `'` | `http.js → csvCell` |
| Oversized payloads | 32 KB body cap, field length limits | `http.js → readJson`, `validate.js` |
| Information leakage | Generic 500 messages; stack traces only in Worker logs | `http.js → errorResponse` |
| Stolen admin password | Optional two-factor sign-in (6-digit authenticator code, RFC 6238). The password is always checked first, so the form never reveals that 2FA is on to someone without it; code checks have their own rate limit | `totp.js`, `auth.service.js`, `admin.routes.js` |
| Double-booked or spammed call slots | Only exact generated slots are accepted, a partial unique index in the database refuses a second booking for the same time, honeypot + rate limit (6 per hour) + optional Turnstile | `booking.js`, `calls.repo.js`, `0003_growth_features.sql` |
| Email scanners cancelling calls | The cancel link opens a page; cancelling needs a click (a `POST` with the same-origin check) | `public.routes.js` |
| Injection through case-study text | The Worker renders case studies with every value HTML-escaped (and a unit test checks it); JSON-LD escapes `<` | `pages/case-study.js` |
| Alert emails leaking visitor data | Error alerts contain the path (no query string), the error message and a short stack, never form content, and are limited to one per 15 minutes | `alert.service.js` |

## Headers (static pages)

Set in `src/client/_headers`: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. API responses add `cache-control: no-store` and `nosniff`.

## POPIA (Protection of Personal Information Act)

| Requirement | How the site meets it |
|---|---|
| Lawful basis and consent | The enquiry form requires an explicit consent tick, which is stored in `enquiries.consent` |
| Minimality | Only what is needed to reply; phone and company are optional; no tracking cookies; fonts self-hosted |
| Openness | `/privacy` explains what is collected, why, where it is stored and for how long |
| Security safeguards | See the table above; admin access only through password-protected accounts |
| Data subject rights | Dashboard **Delete** for erasure requests, CSV export for access requests, one-click unsubscribe |
| Retention | The policy states 24 months, or longer for clients. The daily cron (`repositories/retention.repo.js`) deletes enquiries older than 24 months unless their status is `won`, call bookings older than 24 months and audit entries older than 24 months, and logs how many it removed (`npm run logs`) |

Subscribers stay until they unsubscribe or ask to be removed. Visitors who book a call or send an enquiry can ask for deletion at any time: use **Delete** in the dashboard (enquiries and calls).

## Operational checklist

- [ ] Use a long, unique admin password (a short sentence works well)
- [ ] Set a real `IP_SALT` secret in production
- [ ] Enable 2FA on your Cloudflare and GitHub accounts
- [ ] Turn on two-factor sign-in: Dashboard → Security
- [ ] Enable Turnstile if spam appears
- [ ] Export a database backup monthly
- [ ] Review the dashboard's recent activity occasionally

## Reporting a vulnerability

Email neuropulse.inc@gmail.com with the subject "Security". Please don't open a public issue.
