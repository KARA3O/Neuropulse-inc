# Roadmap: what is done and what could come next

Ideas to grow the site into a fuller business system. Each item notes which Cloudflare product it uses and whether it fits the free plan.

## Done in 1.2.0

| Feature | Where |
|---|---|
| Case-study pages `/work/<slug>` | `src/server/pages/case-study.js`, project editor fields `problem`, `solution`, `results` |
| Testimonials | `testimonials` table, dashboard tab, home page and case studies |
| Automatic reply email to the visitor | `notify.service.js → notifyEnquiryReceived` |
| Instant quote estimator (attaches the choices to the enquiry) | `site.config.json → estimator`, `modules/estimator.js` |
| Book a discovery call | `lib/booking.js`, `calls.repo.js`, dashboard "Calls" tab |
| Cloudflare Web Analytics | `site.config.json → analytics.cloudflareToken` |
| Screenshot uploads from the dashboard | R2 bucket (done in 1.1) |
| Retention cron | `repositories/retention.repo.js` |
| Two-factor login | `lib/totp.js`, dashboard "Security" tab |
| Error alerting by email | `services/alert.service.js` |
| Lead source tracking | `heard_from`, `utm_*`, dashboard sources chart |
| Showreel advert on the home page | `src/client/assets/video/` |

## Next up

| Feature | Why it matters | How | Free? |
|---|---|---|---|
| **Starting prices on the site** | Visitors who see a price range enquire more and waste less of your time | Fill in `site.config.json → estimator` prices and set `showPrices` to `true` | ✅ |
| **Custom domain and business email** | Looks established; lets the automatic replies reach visitors | See "Custom domain" and "Verify your sending domain" in `DEPLOYMENT.md` | Domain costs money, the rest is free |
| **Dynamic sitemap with case studies** | Helps Google find every `/work/<slug>` page | A `/sitemap.xml` route in the Worker that lists published projects | ✅ |
| **Photos and screenshots for every project** | Cards with real screenshots convert better than generated covers | Upload in the dashboard (R2) | ✅ |

## Grow the business

| Feature | Description |
|---|---|
| **Client portal** | Clients sign in to see project progress, weekly preview links, invoices and files: an upgrade of the admin to multiple roles |
| **Online deposits** | PayFast or Yoco payment link generated from an accepted quote |
| **Blog / build log** | Markdown posts stored in D1 or R2; good for SEO and for sharing on X, Instagram and YouTube (PulseClub) |
| **YouTube feed** | Show the latest PulseClub videos on the site (YouTube RSS fetched by a cron and cached in D1) |
| **Status page** | `/status` showing uptime of client sites you host (cron pings each `url`, stores results) |
| **Reminder emails for calls** | A cron that emails a reminder the morning of each booked call |

## Make it more robust

| Feature | Description |
|---|---|
| **Multiple admin roles** | `owner`, `editor` (projects only), `viewer` |
| **Backup codes for two-factor** | One-time codes so a lost phone does not need a database edit |
| **Workers Rate Limiting binding** | Move rate limits out of D1 for zero DB writes on abuse |
| **Playwright UI tests in CI** | Run the form, booking and dashboard flows on every pull request |
| **TypeScript + JSDoc types** | `wrangler types` generates `Env`; catches mistakes earlier |
| **Preview deployments** | Deploy each pull request to a preview URL with a separate D1 database |
| **Lighthouse budget in CI** | Fail the build if performance or accessibility scores drop |
| **Smaller video file** | Re-encode the showreel to about 4 MB for faster loading on mobile data |

## Content to add when available

- Real screenshots for each project (`src/client/assets/work/*.webp`, about 1600×1000) or upload them in the dashboard
- Real client testimonials, with permission
- Results (numbers or outcomes you measured) for each case study
- The exact Facebook page link (currently a search link in `site.config.json`)
- Starting prices per service, once you have settled them
- The custom domain `neuropulseinc.com`
