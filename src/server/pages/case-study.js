/**
 * Server-rendered case-study pages: /work/<slug>
 *
 * The page shell (header, footer, styles) is built from src/client/pages/case-study.html like every
 * other page. This module fills in the project's content, so the text is in the HTML that Google reads
 * and the page loads without waiting for JavaScript. Every value is HTML-escaped, and a section only
 * appears when it has real text, so nothing is made up.
 */
import { findPublishedBySlug } from '../repositories/projects.repo.js';
import { listForProjectSlug } from '../repositories/testimonials.repo.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { live: 'Live', in_development: 'In development', coming_soon: 'Coming soon' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Plain text with blank lines -> paragraphs. */
const paragraphs = (text) =>
  String(text || '')
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`)
    .join('');

const section = (title, text, extra = '') =>
  text && String(text).trim() ? `<section class="cs-block"><h2>${esc(title)}</h2>${paragraphs(text)}${extra}</section>` : '';

export function caseStudyBody(project, testimonials = []) {
  const accent = /^#[0-9a-f]{6}$/i.test(project.accent || '') ? project.accent : '#1E9BFF';
  const cover = project.image_url
    ? `<img src="${esc(project.image_url)}" alt="Screenshot of the ${esc(project.name)} website" width="1200" height="750" decoding="async">`
    : `<div class="cover-gen" aria-hidden="true"><span>${esc(project.name)}</span></div>`;

  const visit = project.url
    ? `<a class="btn btn--primary btn--lg" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">${project.status === 'live' ? 'Visit the live site' : 'Open the preview'}<span class="sr-only"> (opens in a new tab)</span></a>`
    : '';

  const launched = project.launched_at && /^\d{4}-\d{2}-\d{2}$/.test(project.launched_at)
    ? `${MONTHS[Number(project.launched_at.slice(5, 7)) - 1]} ${project.launched_at.slice(0, 4)}`
    : '';

  const facts = [
    project.client && ['Client', project.client],
    project.industry && ['Industry', project.industry],
    launched && ['Launched', launched],
  ].filter(Boolean);

  const tech = project.tech?.length
    ? `<ul class="project__tech" role="list" aria-label="Built with">${project.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';

  const quotes = testimonials.length
    ? `<section class="cs-block cs-quotes" aria-label="What the client said">${testimonials
        .map((t) => `<figure class="quote"><blockquote><p>${esc(t.quote)}</p></blockquote><figcaption><strong>${esc(t.author_name)}</strong>${t.author_role ? `<span>${esc(t.author_role)}</span>` : ''}</figcaption></figure>`)
        .join('')}</section>`
    : '';

  // When only the short description exists, show it as "About"; otherwise it is the intro under the title.
  const hasStory = project.problem || project.solution || project.results;

  return `
  <section class="page-hero cs-hero" aria-labelledby="cs-title" style="--accent:${accent}">
    <div class="wrap cs-hero__grid">
      <div class="cs-hero__text">
        <p class="cs-crumb"><a href="/work">Our work</a> <span aria-hidden="true">/</span> ${esc(project.name)}</p>
        <div class="project__top"><span class="pill pill--${esc(project.status)}">${esc(STATUS[project.status] || '')}</span>${project.industry ? `<span class="project__industry">${esc(project.industry)}</span>` : ''}</div>
        <h1 class="page-hero__title" id="cs-title">${esc(project.name)}</h1>
        <p class="page-hero__lede">${esc(project.summary)}</p>
        <div class="cs-actions">${visit}<a class="btn btn--ghost btn--lg" href="/#contact">Start a project like this</a></div>
      </div>
      <div class="project__cover cs-cover" style="--accent:${accent}">${cover}</div>
    </div>
  </section>

  <section class="section section--paper cs-body">
    <div class="wrap cs-grid">
      <div class="cs-main">
        ${section(hasStory ? 'About the project' : 'The project', project.description)}
        ${section('The challenge', project.problem)}
        ${section('What we built', project.solution)}
        ${section('The result', project.results)}
        ${quotes}
      </div>
      <aside class="cs-side" aria-label="Project facts">
        ${facts.length ? `<dl class="cs-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${tech ? `<h2 class="cs-side__title">Built with</h2>${tech.replace('project__tech', 'project__tech project__tech--light')}` : ''}
      </aside>
    </div>
  </section>

  <section class="section section--ink cs-cta">
    <div class="wrap">
      <h2 class="h-section">Want something like this for your business?</h2>
      <p>Tell us the problem and we will reply within one business day with a plan and a fixed quote.</p>
      <div class="cs-actions"><a class="btn btn--primary btn--lg" href="/#contact">Start a project</a><a class="btn btn--ghost btn--lg" href="/#book">Book a free call</a></div>
    </div>
  </section>`;
}

/** Escape a value for use inside an HTML attribute. */
const attr = esc;

/** @returns {Promise<Response>} the finished page, or a 404 page for unknown or unpublished projects */
export async function renderCaseStudy(env, request, slug) {
  const origin = new URL(request.url).origin;
  const project = await findPublishedBySlug(env.DB, slug);

  if (!project) {
    const notFound = await env.ASSETS.fetch(new Request(`${origin}/404`));
    return new Response(notFound.body, { status: 404, headers: notFound.headers });
  }

  const template = await env.ASSETS.fetch(new Request(`${origin}/case-study`));
  let html = await template.text();

  const testimonials = await listForProjectSlug(env.DB, slug);
  const title = `${project.name} case study | Neuropulse Inc.`;
  const description = project.summary.length > 160 ? `${project.summary.slice(0, 157)}...` : project.summary;
  const canonical = `${env.SITE_URL}/work/${project.slug}`;
  const image = project.image_url
    ? (project.image_url.startsWith('/') ? `${env.SITE_URL}${project.image_url}` : project.image_url)
    : `${env.SITE_URL}/assets/brand/og-image.png`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    description: project.summary,
    url: canonical,
    image,
    creator: { '@type': 'Organization', name: 'Neuropulse Inc.', url: env.SITE_URL },
  }).replace(/</g, '\\u003c');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, (_, a, b) => `${a}${attr(description)}${b}`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, (_, a, b) => `${a}${attr(canonical)}${b}`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => `${a}${attr(title)}${b}`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => `${a}${attr(description)}${b}`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, (_, a, b) => `${a}${attr(canonical)}${b}`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, (_, a, b) => `${a}${attr(image)}${b}`)
    .replace('</head>', () => `<script type="application/ld+json">${jsonLd}</script>\n</head>`)
    .replace(/<!--CASE_STUDY-->[\s\S]*?<!--\/CASE_STUDY-->/, () => caseStudyBody(project, testimonials));

  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=60, s-maxage=300',
    'x-content-type-options': 'nosniff',
  });
  // Same security headers as the static pages (the Worker response does not get _headers applied).
  for (const name of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy']) {
    const v = template.headers.get(name);
    if (v) headers.set(name, v);
  }
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}
