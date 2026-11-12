# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com), versioning: [SemVer](https://semver.org).

## [1.2.0] - 2026-11-12

Run `npm run db:migrate:remote` before deploying: this release adds migrations 0003 and 0004.

### Added
- **Case-study pages** at `/work/<slug>` (rendered by the Worker with the project's text, structured data and canonical link); `problem`, `solution` and `results` fields in the project editor; a "Case study" link on every work card
- **Testimonials**: `testimonials` table, admin tab (add, edit, publish, delete), public `/api/testimonials`, home-page section (hidden until one is published) and quotes on the matching case study
- **Instant estimate** section on the home page, driven by `site.config.json → estimator` (no prices are shown until you fill them in); the choices are saved with the enquiry (`quote_selection`)
- **Discovery-call booking**: `call_bookings` table, `GET /api/calls/slots`, `POST /api/calls`, cancel link page, admin "Calls" tab, `.ics` calendar file and emails to both sides; hours in `src/server/lib/booking.js`, holidays in `BOOKING_BLOCKED_DATES`
- **Automatic reply** email to every enquiry (reference number, WhatsApp and book-a-call buttons), in the site's colours; the owner alert now shows the lead source and estimate
- **Lead source tracking**: "How did you hear about us?" field, `utm_source` / `utm_medium` / `utm_campaign` capture, dashboard "Where enquiries come from" chart, extra CSV columns
- **Showreel**: the Neuropulse advert video, poster and transcript on the home page (`assets/video/`)
- **Two-factor sign-in** (TOTP) for admins: set up and turn off under Dashboard → Security
- **Error alerts**: an email to `NOTIFY_EMAIL` on unexpected 500 errors, throttled to one per 15 minutes, with no visitor details
- **Retention**: the daily cron now deletes enquiries older than 24 months (except `won` clients), old call bookings and old audit entries
- Optional Cloudflare Web Analytics beacon (`site.config.json → analytics.cloudflareToken`)
- Shared Turnstile helper used by the enquiry and booking forms
- 31 new unit tests (two-factor codes against the RFC 6238 test vectors, call slots, calendar files, validation, case-study rendering, 2FA sign-in, error-alert throttle) and 12 new smoke-test checks

### Changed
- `wrangler.jsonc`: `run_worker_first` now includes `/work/*`; new variables `WHATSAPP_URL`, `PHONE_DISPLAY`, `BOOKING_BLOCKED_DATES`
- Content-Security-Policy allows `media-src 'self'` and the Cloudflare Web Analytics beacon
- Home page: new "Book a free call" hero button; sections added in this order: showreel, estimate, testimonials, book a call

### Seeded
- TaskFlow (published, live). LVH application portal, Lecture Room Booking System and Valery Boutique are saved as hidden drafts: review them in the dashboard before publishing

## [1.1.0] - 2026-11-05

### Added
- `/founder` page introducing Karabo Thindisa: portrait, story, journey timeline, skills and past builds, linked from the top bar, footer and home About section
- `/card` and `/poster` short links (in `src/client/_redirects`) used by the printed QR codes
- Halftone "neuropulse" wordmark at the bottom of the footer: brand-gradient dots that part around the pointer and pulse on click (static under reduced motion)

## [1.0.0] - 2026-10-22

### Added
- Cloudflare Workers + D1 architecture (static assets + `/api/*` Worker, daily cron)
- Redesigned website: animated signal top bar, circuit hero, services accordion, process timeline, about, FAQ, contact
- "Our work" showcase from the database with Visit site links and a filterable `/work` page
- Three-step project enquiry form saved to D1, with reference numbers, validation, honeypot, rate limiting and optional Turnstile
- Social links with logos (X, Instagram, YouTube, Facebook) plus WhatsApp, call and email
- Newsletter sign-up and unsubscribe
- Admin dashboard: overview stats, enquiries (status, notes, reply, CSV, delete), projects CRUD with publish toggle, subscribers
- Security: PBKDF2 passwords, hashed HttpOnly sessions, CSRF origin check, CSP and security headers, salted IP hashes
- POPIA privacy policy, 404 page, SEO metadata, sitemap, web manifest, self-hosted brand fonts
- Engineering docs with diagrams, unit tests, smoke test, GitHub Actions deploy

### Changed
- Contact email is now neuropulse.inc@gmail.com (was info@neuropulseinc.com); phone 072 721 6200
- Contact form saves to the database instead of opening the visitor's email app

### Seeded
- WorkLink (published, in development)
- 4GUARD (hidden draft, ready to publish at launch)
