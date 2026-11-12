#!/usr/bin/env node
/**
 * Static site build: src/client  ->  public/
 *
 * No dependencies. Does four things:
 *  1. Renders each page in src/client/pages with shared partials and site.config.json values.
 *  2. Bundles CSS into site.css and admin.css.
 *  3. Copies scripts and assets.
 *  4. Adds a content hash (?v=...) to CSS/JS links so browsers never use stale files.
 *
 * Template syntax (deliberately tiny):
 *   {{> partial}}          include src/client/partials/partial.html
 *   {{site.key}}           value from site.config.json (HTML-escaped)
 *   {{page.key}}           value from the page's meta block
 *   {{icon:name}}          inline SVG from src/client/assets/icons/name.svg
 *   {{socials}}            social links list with logos
 *   {{year}}               current year
 *   {{asset:path}}         path with cache-busting hash, e.g. {{asset:/css/site.css}}
 *
 * Each page starts with:  <!--meta {"title":"...","description":"...","path":"/","nav":"home"}-->
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEARD_FROM } from '../src/server/lib/validate.js'; // one list for the form and the server check

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src/client');
const OUT = join(root, 'public');
const site = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'));

const CSS_BUNDLES = {
  'css/site.css': ['tokens.css', 'base.css', 'header.css', 'components.css', 'home.css', 'work.css', 'founder.css', 'growth.css'],
  'css/admin.css': ['tokens.css', 'base.css', 'components.css', 'admin.css'],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const read = (p) => readFileSync(p, 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Inline an icon SVG, stripping the <title> (the link label carries the name) and adding aria-hidden. */
function icon(name) {
  const p = join(SRC, 'assets/icons', `${name}.svg`);
  if (!existsSync(p)) throw new Error(`Unknown icon: ${name}`);
  return read(p)
    .replace(/<title>.*?<\/title>/, '')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" class="icon" fill="currentColor" ');
}

function socialsHtml() {
  return `<ul class="socials" role="list">${site.socials
    .map(
      (s) =>
        `<li><a class="social social--${s.id}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.label)} (${esc(s.handle)}), opens in a new tab">${icon(s.id)}</a></li>`,
    )
    .join('')}</ul>`;
}

/** Cloudflare Web Analytics beacon (cookie-free), only when a token is set in site.config.json. */
function analyticsHtml() {
  const token = site.analytics?.cloudflareToken;
  if (!token) return '';
  if (!/^[a-f0-9]{32}$/i.test(token)) throw new Error('site.config.json: analytics.cloudflareToken should be the 32-character token from Cloudflare Web Analytics.');
  return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token })}'></script>`;
}

const heardFromOptions = () => HEARD_FROM.map((o) => `<option>${esc(o)}</option>`).join('');

function main() {
  const started = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // 1. Assets and scripts are copied as-is.
  cpSync(join(SRC, 'assets'), join(OUT, 'assets'), { recursive: true });
  cpSync(join(SRC, 'scripts'), join(OUT, 'js'), { recursive: true });
  for (const f of ['_headers', '_redirects', 'robots.txt', 'site.webmanifest']) {
    if (existsSync(join(SRC, f))) cpSync(join(SRC, f), join(OUT, f));
  }
  // The "instant estimate" section reads its choices (and your prices, once you add them) from here.
  if (site.estimator) writeFileSync(join(OUT, 'estimator.json'), JSON.stringify(site.estimator, (k, v) => (k.startsWith('_') ? undefined : v)));

  // 2. CSS bundles.
  for (const [out, parts] of Object.entries(CSS_BUNDLES)) {
    const css = parts.map((f) => `/* ${f} */\n${read(join(SRC, 'styles', f))}`).join('\n');
    mkdirSync(dirname(join(OUT, out)), { recursive: true });
    writeFileSync(join(OUT, out), css);
  }

  // 3a. Stamp relative ES module imports with a build-wide hash, so modules loaded by
  //     main.js are never served stale from the one-year browser cache.
  const jsFiles = walk(join(OUT, 'js')).filter((f) => f.endsWith('.js'));
  const buildId = hash(jsFiles.map((f) => readFileSync(f)).join('\n'));
  for (const f of jsFiles) {
    const src = read(f).replace(/(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3?v=${buildId}$2`);
    writeFileSync(f, src);
  }

  // 3b. Hash map for cache busting (every CSS and JS file in public/).
  const versions = {};
  for (const file of walk(OUT)) {
    if (/\.(css|js)$/.test(file)) versions['/' + relative(OUT, file).split('\\').join('/')] = hash(readFileSync(file));
  }
  const asset = (p) => {
    if (!versions[p]) throw new Error(`Asset not found in build: ${p}`);
    return `${p}?v=${versions[p]}`;
  };

  // 4. Pages.
  const partials = Object.fromEntries(
    readdirSync(join(SRC, 'partials')).map((f) => [f.replace(/\.html$/, ''), read(join(SRC, 'partials', f))]),
  );
  const sitemap = [];

  for (const file of readdirSync(join(SRC, 'pages')).filter((f) => f.endsWith('.html'))) {
    let html = read(join(SRC, 'pages', file));
    const metaMatch = html.match(/^<!--meta\s+(\{[\s\S]*?\})\s*-->\s*/);
    if (!metaMatch) throw new Error(`${file} is missing its <!--meta {...}--> block`);
    const page = JSON.parse(metaMatch[1]);
    html = html.slice(metaMatch[0].length);

    // Partials can include other partials, so expand until stable (max 5 levels).
    for (let i = 0; i < 5 && html.includes('{{>'); i++) {
      html = html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => {
        if (!(n in partials)) throw new Error(`Unknown partial: ${n}`);
        return partials[n];
      });
    }

    html = html
      .replace(/\{\{socials\}\}/g, socialsHtml)
      .replace(/\{\{analytics\}\}/g, analyticsHtml)
      .replace(/\{\{heard_from_options\}\}/g, heardFromOptions)
      .replace(/\{\{icon:([\w-]+)\}\}/g, (_, n) => icon(n))
      .replace(/\{\{asset:([^}]+)\}\}/g, (_, p) => asset(p.trim()))
      .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
      .replace(/\{\{nav:(\w+)\}\}/g, (_, n) => (page.nav === n ? 'aria-current="page"' : ''))
      .replace(/\{\{site\.(\w+)\}\}/g, (_, k) => esc(site[k]))
      .replace(/\{\{page\.(\w+)\}\}/g, (_, k) => esc(page[k] ?? ''));

    const leftover = html.match(/\{\{[^}]*\}\}/);
    if (leftover) throw new Error(`${file}: unresolved template tag ${leftover[0]}`);

    writeFileSync(join(OUT, file), html);
    if (!page.noindex) sitemap.push(page.path);
  }

  writeFileSync(
    join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
      .map((p) => `  <url><loc>${site.url}${p}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );

  console.log(`Built ${readdirSync(OUT).length} entries into public/ in ${Date.now() - started} ms`);
}

main();
