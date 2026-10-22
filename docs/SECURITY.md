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
| Retention | The policy states 24 months. Run the query below periodically, or add it to the cron (see `ROADMAP.md`) |

```sql
DELETE FROM enquiries WHERE status IN ('lost','spam') AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 months');
```

## Operational checklist

- [ ] Use a long, unique admin password (a short sentence works well)
- [ ] Set a real `IP_SALT` secret in production
- [ ] Enable 2FA on your Cloudflare and GitHub accounts
- [ ] Enable Turnstile if spam appears
- [ ] Export a database backup monthly
- [ ] Review the dashboard's recent activity occasionally

## Reporting a vulnerability

Email neuropulse.inc@gmail.com with the subject "Security". Please don't open a public issue.
