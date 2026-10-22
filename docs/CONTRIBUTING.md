# Contributing

## Workflow

1. Branch from `main`: `feature/case-studies`, `fix/form-error`, `docs/api`.
2. Make your change, then run `npm run check` (build + unit tests + deploy dry run).
3. Run `npm run dev` and `npm run test:smoke` for anything touching the API.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org): `feat: add testimonials table`, `fix: phone validation`, `docs: update deployment guide`.
5. Open a pull request. CI must pass before merging; merging to `main` deploys.

## Conventions

| Area | Rule |
|---|---|
| JavaScript | ES modules, 2-space indent, single quotes, semicolons, JSDoc on exported functions |
| Files | `kebab-case.js`; repositories end in `.repo.js`, services in `.service.js`, routes in `.routes.js` |
| SQL | Only inside `src/server/repositories/`; always `.bind()` values, never string-concatenate input |
| Errors | Throw `HttpError(status, userMessage, fields?)`; write messages that tell the user how to fix the problem |
| CSS | Use tokens from `tokens.css`; component classes in BEM-ish style (`.project__name`, `.btn--primary`) |
| Copy | Sentence case, plain language, active voice; buttons say exactly what happens ("Send enquiry") |
| Accessibility | Every control reachable by keyboard; visible focus; respect `prefers-reduced-motion` |

## How to…

**Add a page**
1. Create `src/client/pages/services.html` starting with `<!--meta {"title":"…","description":"…","path":"/services","nav":"services"}-->` then `{{> head}}`.
2. Use `{{> header}}` and `{{> footer}}`.
3. It is served at `/services` and added to `sitemap.xml` automatically.

**Add an API endpoint**
1. Add validation rules to `lib/validate.js` if the endpoint takes input.
2. Add SQL functions to the right file in `repositories/`.
3. Register the route in `routes/public.routes.js` or `routes/admin.routes.js` (wrap admin handlers in `guarded()`).
4. Document it in `docs/API.md` and add a check to `tests/smoke/smoke.mjs`.

**Change the database**
1. `npx wrangler d1 migrations create neuropulse-db describe_change`
2. Write the SQL, then run `npm run db:migrate:local` to test.
3. Update `docs/DATABASE.md` and `docs/diagrams/erd.mmd`.

**Re-render diagrams** (optional; GitHub renders `.mmd` blocks itself)

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i docs/diagrams/erd.mmd -o docs/diagrams/erd.svg -t neutral -b transparent
```
