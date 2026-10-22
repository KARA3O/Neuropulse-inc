# Roadmap: suggested next features

Ideas to grow the site into a fuller business system, grouped by value. Each item notes which Cloudflare product it uses and whether it fits the free plan.

## Next up (high value, low effort)

| Feature | Why it matters | How | Free? |
|---|---|---|---|
| **Case-study pages** `/work/4guard` | Clients judge by results; Google indexes each page | Template page + `GET /api/projects/:slug` (already exists); add `problem`, `solution`, `results` columns | ✅ |
| **Testimonials** | Social proof next to the showcase | `testimonials` table linked to `projects`, admin CRUD, show on cards | ✅ |
| **Auto-reply email to the visitor** | Confirms receipt with their reference number | One more `sendEmail` in `notify.service.js` | ✅ Resend free tier |
| **Cloudflare Web Analytics** | Visitor counts without cookies (POPIA-friendly) | Enable in the dashboard, add the beacon to `head.html` and the CSP | ✅ |
| **Screenshot uploads from the dashboard** | No need to commit images | **R2** bucket + upload endpoint, store the key in `image_url` | ✅ 10 GB free |
| **Retention cron** | Automatically meets the 24-month policy | Add the DELETE from `SECURITY.md` to `scheduled()` | ✅ |

## Grow the business

| Feature | Description |
|---|---|
| **Instant quote estimator** | Visitor picks pages and features and sees a price range before contacting you; the selections attach to the enquiry |
| **Book a discovery call** | Show your available 30-minute slots, save bookings in D1 and email both sides (reuse the 4GUARD booking logic) |
| **Client portal** | Clients sign in to see project progress, weekly preview links, invoices and files: an upgrade of the admin to multiple roles |
| **Online deposits** | PayFast or Yoco payment link generated from an accepted quote |
| **Blog / build log** | Markdown posts stored in D1 or R2; good for SEO and for sharing on X, Instagram and YouTube (PulseClub) |
| **YouTube feed** | Show the latest PulseClub videos on the site (YouTube RSS fetched by a cron and cached in D1) |
| **Status page** | `/status` showing uptime of client sites you host (cron pings each `url`, stores results) |

## Make it more robust

| Feature | Description |
|---|---|
| **Two-factor login** | TOTP (Google Authenticator) for admins; a small table and a verify step |
| **Multiple admin roles** | `owner`, `editor` (projects only), `viewer` |
| **Workers Rate Limiting binding** | Move rate limits out of D1 for zero DB writes on abuse |
| **Error alerting** | Send an email or Slack message on 5xx via Workers Logs and Tail Workers |
| **Playwright UI tests in CI** | Run the form and dashboard flows on every pull request |
| **TypeScript + JSDoc types** | `wrangler types` generates `Env`; catches mistakes earlier |
| **Preview deployments** | Deploy each pull request to a preview URL with a separate D1 database |
| **Lighthouse budget in CI** | Fail the build if performance or accessibility scores drop |

## Content to add when available

- Real screenshots for each project (`src/client/assets/work/*.webp`, about 1600×1000)
- The exact Facebook page link (currently a search link in `site.config.json`)
- A short founder photo and bio for the About section
- Starting prices per service, once you have settled them
- The custom domain `neuropulseinc.com`
