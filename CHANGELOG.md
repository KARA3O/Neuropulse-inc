# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com), versioning: [SemVer](https://semver.org).

## [1.1.0] - 2026-11-05

### Added
- `/founder` page introducing Karabo Thindisa: portrait, story, journey timeline, skills and past builds, linked from the top bar, footer and home About section
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
