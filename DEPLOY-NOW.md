# Deploy version 1.2.0: copy and paste

Written for Windows PowerShell. Your project folder is assumed to be `D:\Neuropulse-inc`: change the path if yours is different.

**Order matters: update the database first, then deploy the site.** The new site needs the new tables. (The other way round is safe: the old site ignores them.)

---

## Option A: deploy from your computer

### 1. Copy the new files into your project

Unzip this project somewhere temporary, then copy it over your folder. This keeps your `.git` history, `node_modules` and `.dev.vars`:

```powershell
$new = "$HOME\np-upgrade"
Expand-Archive "$HOME\Downloads\Neuropulse-inc-v1.2.0.zip" -DestinationPath $new -Force
robocopy "$new\Neuropulse-inc" "D:\Neuropulse-inc" /E /XD node_modules public .wrangler .git /XF .dev.vars
```

(robocopy prints a summary. Exit codes 0 to 7 mean success; that is normal.)

### 2. Install, test, and update the live database

```powershell
cd D:\Neuropulse-inc
npm install
npm test
npm run db:migrate:remote
```

`db:migrate:remote` adds migrations `0003` and `0004`. It keeps all your existing enquiries, projects and admins. Answer `y` when it asks to apply them.

### 3. Deploy

```powershell
npm run deploy
```

This builds the site, runs the tests, does a dry run and uploads it. Open your site when it finishes.

### 4. Check it works (about 1 minute)

```powershell
$env:BASE_URL = "https://neuropulse-inc.workers.dev"        # your real address
$env:ADMIN_EMAIL = "neuropulse.inc@gmail.com"
$env:ADMIN_PASSWORD = "your-admin-password"
npm run test:smoke
```

The test creates a test enquiry, a test project and a test call, checks them, and deletes them again. If you already switched on two-factor sign-in, also set `$env:ADMIN_TOTP_SECRET = "<the setup key from your authenticator app>"` first.

---

## Option B: deploy through GitHub (your repo already deploys on every push to `main`)

```powershell
cd D:\Neuropulse-inc
git checkout -b upgrade-1-2-0
git add -A
git commit -m "Version 1.2.0: case studies, testimonials, call booking, instant estimate, two-factor sign-in"
git push -u origin upgrade-1-2-0
```

Open the pull request on GitHub and merge it into `main`. The GitHub Action then runs the tests, applies the database migrations and deploys, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets you already set.

---

## After it is live: your to-do list (in this order)

1. **Turn on two-factor sign-in.** Sign in at `/admin` → **Security** → **Set up**. Add the key in Google Authenticator or Microsoft Authenticator, then type the first code.
2. **Check the three draft projects.** Dashboard → **Projects**. *LVH application portal*, *Lecture Room Booking System* and *Valery Boutique* were added as **hidden drafts**, because two were built during your internship and one is a personal project, so only you can decide whether they belong under "Our work". Tick **Published** on the ones you want. *TaskFlow* is already published.
3. **Publish 4GUARD** when the client site is live: Projects → 4GUARD → add the live link and a screenshot, set the status to **Live**, tick **Published**.
4. **Add case-study text.** Projects → Edit → "The challenge", "What we built", "The result". Only write what is true; add numbers only if you measured them. Empty boxes are simply not shown.
5. **Add a testimonial** the moment a client agrees to one: Testimonials → Add. The home page section stays hidden until you publish the first.
6. **Make the automatic replies work.** Right now `MAIL_FROM` is Resend's test sender, so replies and call confirmations to *visitors* are skipped (emails to you still arrive). Verify your own domain in Resend, change `MAIL_FROM` in `wrangler.jsonc`, and run `npm run deploy`. Steps: `docs/DEPLOYMENT.md` → "Optional: email alerts".
7. **Add your prices (optional).** Open `site.config.json`, find `"estimator"`, replace the `[null, null]` pairs with your `[lowest, highest]` rand amounts and set `"showPrices": true`. Until then the estimate shows the timeline and says "Fixed price after a free call".
8. **Switch on visitor counts (optional, free, no cookies).** Cloudflare dashboard → **Web Analytics** → add your site → paste the token into `site.config.json` → `"cloudflareToken"`, then deploy again.
9. **Set your call hours and holidays.** Default is Monday to Friday, 09:00 to 16:00 South Africa time. Change hours in `src/server/lib/booking.js`, and list days off in `BOOKING_BLOCKED_DATES` in `wrangler.jsonc` (December holidays are already in).
10. **Use tagged links when you share the adverts**, so the dashboard shows which one works. Examples:
    - `https://YOUR-SITE/?utm_source=instagram&utm_campaign=ad1`
    - `https://YOUR-SITE/?utm_source=whatsapp-status&utm_campaign=ad3`

Facebook link: left as it is (a search link) as you asked; change it later in `site.config.json`.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| `npm run deploy` fails on the tests | Run `npm test` and read the first failure. Nothing was uploaded. |
| Site shows "database is not connected" or `no such table` | Run `npm run db:migrate:remote`, then reload. |
| You want the old version back | `npx wrangler rollback`. The database changes are additive, so the old site keeps working. |
| You lost your authenticator phone | `npx wrangler d1 execute neuropulse-db --remote --command "UPDATE admins SET totp_enabled = 0, totp_secret = NULL WHERE email = 'neuropulse.inc@gmail.com'"` |
| Live logs | `npm run logs` |
| Back up the database first (recommended) | `npx wrangler d1 export neuropulse-db --remote --output backup-before-1-2-0.sql` |

Full documentation: `docs/DEPLOYMENT.md`, `CHANGELOG.md`.
