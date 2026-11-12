# Neuropulse Inc. — company website

> Smarter Technology. Brighter Futures.

The official website of **Neuropulse Inc.**, a South African software and website studio. It shows what we build, showcases client projects with links to their live sites, collects project enquiries into a database, and gives the team an admin dashboard to manage enquiries, showcase projects and subscribers.

It runs entirely on **Cloudflare Workers + D1**, which is free at our scale.

| | |
|---|---|
| **Live URL** | `https://neuropulse-inc.<your-subdomain>.workers.dev` (later `neuropulseinc.com`) |
| **Stack** | Vanilla HTML/CSS/JS front end · Cloudflare Worker API (JavaScript, ES modules) · Cloudflare D1 (SQLite) |
| **Dependencies** | One dev dependency: `wrangler`. No framework, no runtime npm packages. |
| **Contact** | neuropulse.inc@gmail.com · 072 721 6200 |

---

## Features

**Public website**
- Animated top bar: the logo's circuit nodes fire in sequence, a heartbeat signal trace runs along the bar and fills as you scroll, and a sliding indicator follows the section in view
- Circuit-trace hero animation in the logo's style that reacts to the pointer (pauses off-screen, still frame for reduced motion)
- Services accordion, process timeline that fills on scroll, about, FAQ
- **Our work** showcase loaded from the database, with status pills (Live / In development / Coming soon) and **Visit site** buttons that open client sites in a new tab; filterable `/work` page
- Three-step **Start a project** form with per-step validation, a saved draft, a reference number (e.g. `NP-7K3QX2`), honeypot and optional Cloudflare Turnstile
- WhatsApp, call and email channels, social links with logos (X, Instagram, YouTube, Facebook)
- **Showreel**: the Neuropulse advert video on the home page, with a written transcript
- **Instant estimate**: visitors pick a service and add-ons, see a typical timeline (and a price range once you enter your prices in `site.config.json`), and send the choices with their enquiry
- **Case-study pages** at `/work/<slug>`, rendered by the Worker so Google reads the text, with challenge / what we built / result sections that only appear when they have text
- **Testimonials**: real client quotes, shown on the home page and the project's case study (the section stays hidden until you publish one)
- **Book a free 30-minute call**: live availability in South African working hours, no double bookings, confirmation email with a calendar file and a cancel link
- **Automatic reply** to every enquiry with the reference number and WhatsApp / call buttons (needs a verified sender domain, see `docs/DEPLOYMENT.md`)
- **Lead source tracking**: "How did you hear about us?" plus `?utm_source=` link tags, shown in the dashboard and CSV
- Newsletter sign-up with one-click unsubscribe
- POPIA privacy policy, custom 404, SEO (meta, Open Graph, JSON-LD, sitemap, robots), web manifest
- Self-hosted brand fonts (Outfit, DM Sans), so no Google Fonts and no tracking

**Admin dashboard (`/admin`)**
- Overview: new enquiries, 7/30-day counts, win rate, live projects, subscribers, 14-day chart, audit trail
- Enquiries: filter by status, search, detail drawer, status + internal notes, reply by email/WhatsApp/call, CSV export, delete (POPIA erasure)
- Projects: add/edit/delete, publish toggle, feature, ordering, screenshots, cover colour, case-study text
- Calls: upcoming and recent discovery calls, mark completed / no-show / cancelled
- Testimonials: add, edit, publish, delete
- Lead sources chart on the overview (last 90 days)
- Security: optional two-factor sign-in (authenticator app)
- Subscribers list + CSV export

**Engineering**
- Layered Worker: routes → services → repositories, with all SQL in repositories
- PBKDF2 password hashing, hashed session tokens, HttpOnly/SameSite=Strict cookies, CSRF origin check, rate limiting, CSP and security headers, salted IP hashes
- Daily cron cleans expired sessions and rate-limit rows, and applies the 24-month retention rule from the privacy policy (clients with status "won" are kept)
- Email alert to you when the site hits a server error (at most one every 15 minutes)
- Optional cookie-free Cloudflare Web Analytics (paste the token in `site.config.json`)
- Unit tests (`node:test`) and an end-to-end smoke test

---

## Quick start (local)

Requires **Node.js 20+**.

```bash
npm install
cp .dev.vars.example .dev.vars          # local secrets (edit IP_SALT)
npm run db:migrate:local                # create tables + seed WorkLink and the 4GUARD draft
npm run admin:create -- --email neuropulse.inc@gmail.com --name "Karabo"
npm run dev                             # http://localhost:8787
```

- Website: <http://localhost:8787>
- Dashboard: <http://localhost:8787/admin>

`npm run dev` rebuilds `public/` from `src/client/` automatically (see `build.command` in `wrangler.jsonc`). After editing front-end files, restart `npm run dev` or run `npm run build`.

To deploy to the internet, follow **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. It takes about 15 minutes.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build and run locally with a local D1 database |
| `npm run build` | Assemble `src/client` into `public/` |
| `npm test` | Unit tests |
| `npm run test:smoke` | End-to-end API test against a running server (set `ADMIN_EMAIL`/`ADMIN_PASSWORD` for admin checks) |
| `npm run db:create` | Create the production D1 database |
| `npm run db:migrate:local` / `:remote` | Apply migrations |
| `npm run admin:create -- --email … --name … [--remote]` | Create or reset an admin |
| `npm run check` | Build + tests + deploy dry run |
| `npm run deploy` | `check`, then deploy to Cloudflare |
| `npm run logs` | Stream live production logs |

---

## Project structure

```
neuropulse-inc/
├── README.md                     ← you are here
├── CHANGELOG.md
├── LICENSE
├── package.json                  scripts + the single dev dependency (wrangler)
├── wrangler.jsonc                Cloudflare config: Worker, static assets, D1 binding, cron, vars
├── site.config.json              company details used by the build (email, phone, socials)
├── .dev.vars.example             template for local secrets
├── .github/workflows/
│   └── deploy.yml                CI: test on every push, deploy main to Cloudflare
│
├── docs/                         engineering documentation
│   ├── ARCHITECTURE.md           system context, layers, request flows
│   ├── DATABASE.md               ER diagram, tables, indexes, migrations
│   ├── API.md                    every endpoint with request/response examples
│   ├── DEPLOYMENT.md             step-by-step Cloudflare deployment + custom domain
│   ├── SECURITY.md               threat model and controls (incl. POPIA)
│   ├── ROADMAP.md                suggested next features
│   ├── CONTRIBUTING.md           conventions, branching, adding a page/endpoint
│   └── diagrams/                 Mermaid sources (*.mmd) + rendered SVGs
│
├── migrations/                   D1 schema, applied in order
│   ├── 0001_initial_schema.sql
│   └── 0002_seed_projects.sql
│
├── scripts/
│   ├── build.mjs                 static site build (partials, CSS bundles, cache-busting)
│   └── create-admin.mjs          creates admin accounts with a hashed password
│
├── src/
│   ├── server/                   ── Cloudflare Worker (back end) ──
│   │   ├── index.js              entry: fetch() → assets or API; scheduled() → cleanup
│   │   ├── router.js             tiny method + path router
│   │   ├── middleware/           security.js · rate-limit.js · auth.js
│   │   ├── routes/               public.routes.js · admin.routes.js   (controllers)
│   │   ├── services/             auth · notify (email) · turnstile    (business logic)
│   │   ├── repositories/         projects · enquiries · subscribers · admins  (SQL only)
│   │   └── lib/                  http.js · validate.js · crypto.js    (pure helpers)
│   │
│   └── client/                   ── Website (front end source) ──
│       ├── pages/                index · work · founder · privacy · 404 · admin
│       ├── partials/             head · header · footer · logo-mark · enquiry-form
│       ├── styles/               tokens · base · header · components · home · work · admin
│       ├── scripts/              main.js + modules/ (topbar, hero, work, brief, …) + admin/app.js
│       ├── assets/               brand/ (logos, favicons, OG image) · fonts/ · icons/ · work/
│       ├── _headers              security + cache headers for static files
│       ├── robots.txt
│       └── site.webmanifest
│
├── tests/
│   ├── unit/                     validation, crypto, router, CSV
│   └── smoke/smoke.mjs           end-to-end API checks
│
└── public/                       GENERATED by the build. Do not edit, not committed.
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

---

## Everyday tasks

**Add 4GUARD to the showcase when it launches.** It is already in the database as a hidden draft.
1. Save a screenshot as `src/client/assets/work/4guard.webp` (about 1600×1000) and deploy, or use any `https://` image link.
2. Open `/admin` → **Projects** → **4GUARD** → **Edit**.
3. Add the website link and screenshot path, set status to **Live**, tick **Published**, then save.

It appears on the home page and `/work` within a minute (the list is cached for 60 seconds).

**Change the email, phone or social links:** edit `site.config.json`, then rebuild or redeploy.

**Change colours or fonts:** `src/client/styles/tokens.css`.

---

## Licence

MIT © 2026 Neuropulse Inc. Fonts: Outfit and DM Sans, SIL Open Font License (see `src/client/assets/fonts/`). Social icons: [Simple Icons](https://simpleicons.org) (CC0); each logo remains its owner's trademark.
