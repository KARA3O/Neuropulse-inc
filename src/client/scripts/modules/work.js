/**
 * Renders showcase projects from /api/projects into [data-work-grid].
 * Supports data-limit (home page preview) and the filter buttons on /work.
 */
import { api, escapeHtml as e } from './api.js';

const STATUS_LABEL = { live: 'Live', in_development: 'In development', coming_soon: 'Coming soon' };
const EXTERNAL = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 10L10 4M5 4h5v5"/></svg>';

function card(p, featured) {
  const cover = p.image_url
    ? `<img src="${e(p.image_url)}" alt="Screenshot of the ${e(p.name)} website" loading="lazy" decoding="async" width="1200" height="750">`
    : `<div class="cover-gen" aria-hidden="true"><span>${e(p.name)}</span></div>`;

  let action;
  if (p.url && p.status === 'live') {
    action = `<a class="btn btn--primary btn--sm visit" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">Visit site ${EXTERNAL}<span class="sr-only"> (opens ${e(p.name)} in a new tab)</span></a>`;
  } else if (p.url) {
    action = `<a class="btn btn--ghost btn--sm visit" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">Preview ${EXTERNAL}<span class="sr-only"> (opens in a new tab)</span></a>`;
  } else {
    action = `<span class="project__note">${p.status === 'coming_soon' ? 'Launching soon' : 'Being built now'}</span>`;
  }

  // Every published project has its own case-study page at /work/<slug>.
  const more = `<a class="project__more" href="/work/${e(p.slug)}">Case study<span class="sr-only"> for ${e(p.name)}</span></a>`;

  return `
    <article class="project${featured ? ' project--featured' : ''}" data-status="${e(p.status)}">
      <div class="project__cover" data-accent="${e(p.accent || '')}">${cover}</div>
      <div class="project__body">
        <div class="project__top">
          <span class="pill pill--${e(p.status)}">${STATUS_LABEL[p.status] || ''}</span>
          ${p.industry ? `<span class="project__industry">${e(p.industry)}</span>` : ''}
        </div>
        <h3 class="project__name">${e(p.name)}</h3>
        ${p.client ? `<p class="project__client">${e(p.client)}</p>` : ''}
        <p class="project__summary">${e(p.summary)}</p>
        ${p.tech?.length ? `<ul class="project__tech" role="list" aria-label="Built with">${p.tech.map((t) => `<li>${e(t)}</li>`).join('')}</ul>` : ''}
        <div class="project__actions">${action}${more}</div>
      </div>
    </article>`;
}

const INVITE = `
  <article class="project project--invite">
    <h3>Your business could be next</h3>
    <p>Tell us what you want to build and we will send a plan and a fixed quote.</p>
    <div><a class="btn btn--primary btn--sm" href="/#contact">Start a project</a></div>
  </article>`;

export async function initWork() {
  const grid = document.querySelector('[data-work-grid]');
  const limit = Number(grid.dataset.limit) || Infinity;
  const { ok, data } = await api('/api/projects');

  if (!ok) {
    grid.innerHTML = `<p class="work-empty">Projects could not load right now. Refresh the page to try again.</p>`;
    return;
  }

  const all = data.projects || [];
  const render = (filter) => {
    const list = filter === 'all' ? all : all.filter((p) => p.status === filter);
    const shown = list.slice(0, limit);
    if (!shown.length) {
      grid.innerHTML = `<p class="work-empty">No ${filter === 'all' ? '' : STATUS_LABEL[filter].toLowerCase() + ' '}projects to show yet.</p>${INVITE}`;
      return;
    }
    // Only feature the first project when it has the featured flag and there is room to span.
    grid.innerHTML = shown.map((p, i) => card(p, i === 0 && p.featured && shown.length > 1)).join('') + INVITE;
    grid.querySelectorAll('[data-accent]').forEach((el) => {
      if (/^#[0-9a-f]{6}$/i.test(el.dataset.accent)) el.style.setProperty('--accent', el.dataset.accent);
    });
  };
  render('all');

  const filters = document.querySelector('[data-filters]');
  filters?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    filters.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    render(btn.dataset.filter);
  });
}
