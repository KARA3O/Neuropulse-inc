# Deployment guide

![Deployment](diagrams/deployment.svg)

Everything below is free on Cloudflare's Workers Free plan.

## 0. Prerequisites

- A free Cloudflare account: <https://dash.cloudflare.com/sign-up>
- Node.js 20 or newer (`node -v`)
- This project unzipped, with `npm install` done

## 1. Sign in to Cloudflare from your terminal

```bash
npx wrangler login
```

A browser window opens. Click **Allow**.

## 2. Create the production database

```bash
npm run db:create
```

Wrangler prints something like:

```
[[d1_databases]]
binding = "DB"
database_name = "neuropulse-db"
database_id = "a1b2c3d4-...."
```

Copy the `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

## 3. Create the tables

```bash
npm run db:migrate:remote
```

## 4. Create project image storage

Project screenshot uploads use a public-read Worker route backed by a private R2 bucket:

```bash
npx wrangler r2 bucket create neuropulse-project-images
```

The `PROJECT_IMAGES` binding is already configured in `wrangler.jsonc`. If deploying with GitHub Actions, the Cloudflare API token also needs **Workers Scripts: Edit** and **R2 Storage: Edit** permissions.

## 5. Set the secrets

```bash
npx wrangler secret put IP_SALT
# paste a long random string, e.g. the output of:  node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

Optional (can be added any time later):

```bash
npx wrangler secret put RESEND_API_KEY         # email alerts for new enquiries
npx wrangler secret put TURNSTILE_SECRET_KEY   # bot protection
```

## 6. Deploy

```bash
npm run deploy
```

This builds the site, runs the tests, does a dry run, then uploads. At the end Wrangler prints your URL:

```
https://neuropulse-inc.<your-subdomain>.workers.dev
```

Open it, then update `SITE_URL` in `wrangler.jsonc` and `url` in `site.config.json` to that address (or your domain) and deploy again, so emails, the sitemap and social previews use the right link.

## 7. Create your admin account

```bash
npm run admin:create -- --email neuropulse.inc@gmail.com --name "Karabo" --remote
```

Then sign in at `https://YOUR-URL/admin`.

## 8. Check it works

```bash
BASE_URL=https://YOUR-URL ADMIN_EMAIL=neuropulse.inc@gmail.com ADMIN_PASSWORD='your-password' npm run test:smoke
```

The smoke test creates and deletes a test enquiry and a test project. Run it right after deploying, not on a busy day.

---

## Upgrading an existing site to 1.2.0

```bash
npm install
npm run db:migrate:remote     # adds migrations 0003 and 0004 (safe: existing rows are kept)
npm run deploy                # builds, runs the tests, dry-runs, then uploads
```

Then open `/admin` → **Security** and turn on two-factor sign-in.

## Optional: email alerts (Resend, free 3,000 emails/month)

1. Sign up at <https://resend.com> with neuropulse.inc@gmail.com and create an API key.
2. `npx wrangler secret put RESEND_API_KEY` and paste the key.
3. Until you verify your own domain in Resend, `MAIL_FROM` must stay `onboarding@resend.dev`, and Resend only delivers to the email you signed up with. That is fine for alerts to you (new enquiries, new calls, server errors), **but the automatic replies and call confirmations to visitors are skipped** until step 4. The booking page tells the visitor honestly when no confirmation email will arrive.
4. After you own a domain, verify it in Resend (Domains → Add domain, then add the DNS records it shows) and change `MAIL_FROM` in `wrangler.jsonc` to `Neuropulse <hello@yourdomain>`, then `npm run deploy`. From then on every enquiry gets an automatic reply and every booked call a confirmation with a calendar file.

## Optional: visitor counts (Cloudflare Web Analytics, free, no cookies)

1. Cloudflare dashboard → **Analytics & Logs → Web Analytics → Add a site** (use your workers.dev or custom hostname).
2. Copy the **token** (32 characters) and paste it into `site.config.json → analytics.cloudflareToken`.
3. `npm run deploy`. The privacy policy needs no change: the beacon sets no cookies.

## Optional: show prices in the instant estimate

Open `site.config.json → estimator`. Replace each `[null, null]` with `[lowest, highest]` rand amounts for that service, page count or add-on (for example `[4000, 9000]`), then set `"showPrices": true`. A range is shown only when **every** selected item has both numbers; otherwise visitors see "Fixed price after a free call". The prices are only a guide shown on the page, so keep the wording "a guide, not a quote".

## Optional: call booking hours and holidays

- Hours and days: `BOOKING` at the top of `src/server/lib/booking.js` (default Monday to Friday, 09:00 to 16:00 South Africa time, 30-minute calls, up to 14 days ahead, 12 hours' notice).
- Days with no calls (public holidays, leave): `BOOKING_BLOCKED_DATES` in `wrangler.jsonc`, a comma-separated list like `2026-12-16,2026-12-25`.
- Calls already booked for a blocked day stay in the dashboard; message those visitors yourself.

## Two-factor sign-in: set up and recover

Set up: dashboard → **Security** → **Set up**, add the key in an authenticator app, type the first code. If you lose the phone, remove the key from the database:

```bash
npx wrangler d1 execute neuropulse-db --remote --command "UPDATE admins SET totp_enabled = 0, totp_secret = NULL WHERE email = 'neuropulse.inc@gmail.com'"
```

## Optional: bot protection (Turnstile, free)

1. Cloudflare dashboard → **Turnstile** → **Add widget**. Add your workers.dev hostname (and later your domain).
2. Put the **site key** in `wrangler.jsonc → vars.TURNSTILE_SITE_KEY`.
3. `npx wrangler secret put TURNSTILE_SECRET_KEY` with the **secret key**.
4. `npm run deploy`. The form now shows the "I am human" check automatically.

## Optional: custom domain (neuropulseinc.com)

1. Buy the domain (a `.co.za` from a South African registrar or a `.com` from Cloudflare Registrar at cost).
2. Add the domain to Cloudflare (**Add a site**) and change the nameservers at your registrar if you bought it elsewhere.
3. Add to `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "neuropulseinc.com", "custom_domain": true }]
   ```
4. Update `SITE_URL`, `site.config.json → url` and `robots.txt`, then `npm run deploy`.
5. With the domain on Cloudflare you can also use **Email Routing** (free) to receive `hello@neuropulseinc.com` in your Gmail.

## Optional: automatic deploys from GitHub

`.github/workflows/deploy.yml` runs the tests on every push and pull request, and deploys `main` to Cloudflare.

1. Cloudflare dashboard → **My Profile → API Tokens → Create token** → template **Edit Cloudflare Workers**. Also give it **D1: Edit** and **R2 Storage: Edit**.
2. GitHub repo → **Settings → Secrets and variables → Actions** → add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (shown on the Workers dashboard).
3. Push to `main`.

---

## Operations

| Task | Command |
|---|---|
| Live logs | `npm run logs` |
| Roll back to a previous version | `npx wrangler rollback` |
| List deployments | `npx wrangler deployments list` |
| Back up the database | `npx wrangler d1 export neuropulse-db --remote --output backup.sql` |
| Reset an admin password | `npm run admin:create -- --email … --name … --remote` |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `The database is not connected` (503) | `database_id` in `wrangler.jsonc` is still the placeholder, or migrations have not run |
| `no such table: projects` | Run `npm run db:migrate:remote` (or `:local`) |
| Login works locally but not live | Make sure you created the admin with `--remote` |
| Changes to CSS/HTML don't show locally | Restart `npm run dev` (the build runs on start) |
| `Too many attempts` while testing | Rate limits reset after the window (1 hour for enquiries, 15 minutes for login); locally, delete `.wrangler/state` to reset |
| Daily limit error from D1 | Free-plan daily row limits were reached; they reset at 00:00 UTC (02:00 SAST) |
