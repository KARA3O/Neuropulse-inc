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
One published project, or `404`.

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
| `turnstileToken` | required only when Turnstile is configured |
| `website` | honeypot: must be empty |

`201` → `{ "ok": true, "reference": "NP-7K3QX2" }`

### `POST /api/subscribe`
`{ "email": "you@example.com" }` → `201`. Repeat sign-ups are idempotent. Rate limit: 5 per hour.

### `GET /api/unsubscribe?token=…`
Returns a small HTML confirmation page.

---

## Admin

All admin routes except `login` require the `np_session` cookie, which is set by login (HttpOnly, SameSite=Strict, 7 days).

| Method | Path | Body / query | Result |
|---|---|---|---|
| POST | `/api/admin/login` | `{ email, password }` | Sets cookie, `{ admin }`. Rate limit: 8 per 15 minutes |
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
| GET | `/api/admin/subscribers` | | `{ subscribers }` |
| GET | `/api/admin/subscribers.csv` | | CSV download |

**Project fields:** `name`\*, `slug`\*, `summary`\*, `status`\* (`live`/`in_development`/`coming_soon`), `client`, `industry`, `description`, `url` (https), `image_url` (`https://…` or `/assets/…`), `accent` (`#RRGGBB`), `tech` (array or comma list, ≤ 12), `featured`, `published`, `sort_order` (0–10000), `launched_at` (`YYYY-MM-DD`). \* = required on create.

### Examples (curl)

```bash
curl -s https://YOUR-SITE/api/projects | jq

curl -s -X POST https://YOUR-SITE/api/enquiries \
  -H 'content-type: application/json' \
  -d '{"name":"Thabo M","email":"thabo@example.co.za","service":"Business website","message":"We need a site for our plumbing business in Mokopane.","consent":true}'
```
