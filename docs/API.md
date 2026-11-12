# API reference

Base path: `/api`. All requests and responses are JSON (`content-type: application/json`) unless noted.

**Response shape**

```json
{ "ok": true, "...": "..." }
{ "ok": false, "error": "Human-readable message", "fields": { "email": "Enter a valid email address..." } }
```

| Status | Meaning |
|---|---|
| 200 / 201 | Success / created |
| 400 | Bad input (invalid JSON, failed bot check) |
| 401 | Not signed in (admin routes) |
| 403 | Cross-site request blocked |
| 404 / 405 | Unknown endpoint / wrong method |
| 409 | Conflict (duplicate slug) |
| 413 / 415 | Body too large / not JSON |
| 422 | Validation failed, see `fields` |
| 429 | Rate limited |
| 500 / 503 | Server error / database not bound |

**CSRF:** every `POST`, `PATCH` and `DELETE` must come from the same origin (the browser's `Origin` header is checked).

---

## Public

### `GET /api/health`
```json
{ "ok": true, "service": "neuropulse-inc", "db": "up", "dbLatencyMs": 3, "time": "2026-10-22T19:00:00.000Z" }
```

### `GET /api/config`
Public settings for the front end. Cached 5 minutes.
```json
{ "turnstileSiteKey": null, "services": ["Business website", "..."], "budgets": ["..."], "timelines": ["..."] }
```

### `GET /api/projects`
Published projects, featured first. Cached 60 seconds.
```json
{
  "ok": true,
  "projects": [{
    "slug": "worklink", "name": "WorkLink", "client": "Neuropulse (in-house)", "industry": "Jobs & marketplace",
    "summary": "A job marketplace where people post work, apply, hire and get paid.",
    "description": "...", "url": null, "image_url": null, "accent": "#1E9BFF",
    "tech": ["React", "Node.js", "Express", "PostgreSQL", "Prisma"],
    "status": "in_development", "featured": true, "launched_at": null
  }]
}
```

### `GET /api/projects/:slug`
One published project, or `404`. Projects also carry optional `problem`, `solution` and `results` text for the case-study page.

### `GET /work/:slug` (page, not JSON)
The case-study page for a published project, rendered by the Worker (title, description, canonical link and structured data are filled in per project). Unpublished or unknown slugs return the 404 page.

### `GET /api/testimonials`
Published client quotes. Cached 60 seconds.
```json
{ "ok": true, "testimonials": [{ "author_name": "…", "author_role": "Owner, …", "quote": "…", "project_slug": "4guard", "project_name": "4GUARD" }] }
```

### `GET /api/calls/slots`
Open discovery-call times for the next two weeks (South Africa time, Monday to Friday, hours set in `src/server/lib/booking.js`). Times are UTC ISO strings.
```json
{ "ok": true, "timezone": "Africa/Johannesburg", "timezoneLabel": "South Africa time (SAST)", "slotMinutes": 30,
  "days": [{ "date": "2026-11-13", "slots": ["2026-11-13T07:00:00.000Z", "…"] }] }
```

### `POST /api/calls`
Rate limit: 6 per hour per visitor.

| Field | Rules |
|---|---|
| `slot` | required, exactly one of the times from `/api/calls/slots` |
| `name`, `email` | required |
| `phone`, `company`, `topic` | optional (topic ≤ 500) |
| `consent` | required `true` |
| `turnstileToken` | only when Turnstile is configured |
| `website` | honeypot: must be empty |

`201` → `{ ok, reference: "CALL-7K3QX2", starts_at, label, timezoneLabel, confirmationEmail }`. `409` with `fields.slot` when the time is no longer available (someone booked it first).

### `GET /api/calls/cancel?token=…` and `POST /api/calls/cancel`
The link in the confirmation email. The `GET` shows a page with a button; the `POST` (form field `token`) cancels and frees the time.

### `POST /api/enquiries`
Rate limit: 5 per hour per visitor.

| Field | Rules |
|---|---|
| `name` | required, 2–80 |
| `email` | required, valid email |
| `phone` | optional, `072 123 4567` or `+27…` format |
| `company` | optional, ≤ 100 |
| `service` | required, one of `GET /api/config → services` |
| `budget`, `timeline` | optional, one of the config lists |
| `message` | required, 20–4000 |
| `contact_pref` | `email` (default), `phone` or `whatsapp` |
| `consent` | required `true` (POPIA) |
| `source_page` | optional |
| `heard_from` | optional, one of `GET /api/config → heardFrom` |
| `utm_source`, `utm_medium`, `utm_campaign` | optional, ≤ 60 characters of letters, numbers and `. : + - /` |
| `quote_selection` | optional JSON text (≤ 1500) from the instant-estimate section |
| `turnstileToken` | required only when Turnstile is configured |
| `website` | honeypot: must be empty |

`201` → `{ "ok": true, "reference": "NP-7K3QX2" }`. The owner is emailed, and the visitor gets an automatic reply (when a verified `MAIL_FROM` domain is configured).

### `POST /api/subscribe`
`{ "email": "you@example.com" }` → `201`. Repeat sign-ups are idempotent. Rate limit: 5 per hour.

### `GET /api/unsubscribe?token=…`
Returns a small HTML confirmation page.

---

## Admin

All admin routes except `login` require the `np_session` cookie, which is set by login (HttpOnly, SameSite=Strict, 7 days).

| Method | Path | Body / query | Result |
|---|---|---|---|
| POST | `/api/admin/login` | `{ email, password, code? }` | Sets cookie, `{ admin }`. Rate limit: 8 per 15 minutes. With two-factor on, a correct password without a valid `code` returns `401` with `fields.code` |
| POST | `/api/admin/logout` | | Clears cookie and deletes the session |
| GET | `/api/admin/me` | | `{ admin }` |
| GET | `/api/admin/stats` | | `{ stats, activity }` |
| GET | `/api/admin/enquiries` | `?status=&q=&limit=25&offset=0` | `{ items, total, limit, offset }` |
| GET | `/api/admin/enquiries.csv` | | CSV download (formula-injection safe) |
| GET | `/api/admin/enquiries/:id` | | `{ enquiry }` |
| PATCH | `/api/admin/enquiries/:id` | `{ status?, notes? }` | `{ enquiry }` |
| DELETE | `/api/admin/enquiries/:id` | | Erases the enquiry (POPIA request) |
| GET | `/api/admin/projects` | | All projects, including drafts |
| POST | `/api/admin/projects` | project fields | `201 { project }` |
| PATCH | `/api/admin/projects/:id` | any project fields | `{ project }` |
| DELETE | `/api/admin/projects/:id` | | |
| POST | `/api/admin/projects/image` | multipart file field `image` (JPEG, PNG or WebP; ≤ 5 MB) | `201 { image_url }` |
| GET | `/media/projects/:filename` | | Public project screenshot |
| GET | `/api/admin/subscribers` | | `{ subscribers }` |
| GET | `/api/admin/subscribers.csv` | | CSV download |
| GET | `/api/admin/testimonials` | | All quotes, including unpublished |
| POST | `/api/admin/testimonials` | `author_name`\*, `quote`\* (10–500), `author_role`, `project_id`, `published`, `sort_order` | `201 { testimonial }` |
| PATCH | `/api/admin/testimonials/:id` | any of the fields above | `{ testimonial }` |
| DELETE | `/api/admin/testimonials/:id` | | |
| GET | `/api/admin/calls` | | `{ upcoming, past }` |
| PATCH | `/api/admin/calls/:id` | `{ status }` (`confirmed`, `completed`, `cancelled`, `no_show`) | |
| DELETE | `/api/admin/calls/:id` | | Erases the booking (POPIA request) |
| GET | `/api/admin/2fa` | | `{ enabled }` |
| POST | `/api/admin/2fa/setup` | `{}` | `{ secret, uri }` (the setup key for the authenticator app) |
| POST | `/api/admin/2fa/enable` | `{ code }` | Turns two-factor on after a first valid code. Rate limit: 10 per 15 minutes |
| POST | `/api/admin/2fa/disable` | `{ password, code }` | Turns it off |

`GET /api/admin/stats` also returns `stats.calls.upcoming` and `stats.enquiries.sources` (where enquiries came from, last 90 days).

**Project fields:** `name`\*, `slug`\*, `summary`\*, `status`\* (`live`/`in_development`/`coming_soon`), `client`, `industry`, `description`, `problem`, `solution`, `results` (each ≤ 2000, shown on the case study), `url` (https), `image_url` (`https://…`, `/assets/…` or an uploaded `/media/projects/…` image), `accent` (`#RRGGBB`), `tech` (array or comma list, ≤ 12), `featured`, `published`, `sort_order` (0–10000), `launched_at` (`YYYY-MM-DD`). \* = required on create.

### Examples (curl)

```bash
curl -s https://YOUR-SITE/api/projects | jq

curl -s -X POST https://YOUR-SITE/api/enquiries \
  -H 'content-type: application/json' \
  -d '{"name":"Thabo M","email":"thabo@example.co.za","service":"Business website","message":"We need a site for our plumbing business in Mokopane.","consent":true}'
```
