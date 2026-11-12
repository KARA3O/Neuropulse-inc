/**
 * "Get an instant estimate": the visitor picks a service and add-ons, sees a typical timeline (and a
 * price range once you have entered prices in site.config.json), then sends the choices with their
 * enquiry. Choices are built from /estimator.json, which the build copies from site.config.json.
 */
import { api, escapeHtml as e } from './api.js';

const sum = (parts, i) => parts.reduce((total, p) => total + p[i], 0);

export async function initEstimator() {
  const root = document.querySelector('[data-estimator]');
  const { ok, data: cfg } = await api('/estimator.json');
  if (!ok || !cfg.types?.length) { root.hidden = true; return; }

  const typesBox = root.querySelector('[data-est-types]');
  const pagesWrap = root.querySelector('[data-est-pages-wrap]');
  const pagesSel = root.querySelector('[data-est-pages]');
  const extrasWrap = root.querySelector('[data-est-extras-wrap]');
  const extrasBox = root.querySelector('[data-est-extras]');
  const result = root.querySelector('[data-est-result]');
  const state = { type: null, pages: null, extras: new Set() };

  typesBox.innerHTML = cfg.types
    .map((t) => `<label class="choice"><input type="radio" name="est-type" value="${e(t.id)}"><span>${e(t.label)}<small>${e(t.hint)}</small></span></label>`)
    .join('');

  pagesSel.innerHTML = (cfg.pages?.options || []).map((o) => `<option value="${e(o.id)}">${e(o.label)}</option>`).join('');

  const typeById = (id) => cfg.types.find((t) => t.id === id);
  const pagesById = (id) => cfg.pages?.options.find((o) => o.id === id);
  const extraById = (id) => cfg.extras.find((x) => x.id === id);

  function renderExtras() {
    const list = cfg.extras.filter((x) => x.types.includes(state.type.id));
    extrasWrap.hidden = !list.length;
    extrasBox.innerHTML = list
      .map((x) => `<label class="choice choice--check"><input type="checkbox" value="${e(x.id)}"${state.extras.has(x.id) ? ' checked' : ''}><span>${e(x.label)}</span></label>`)
      .join('');
  }

  function compute() {
    const type = state.type;
    const pages = cfg.pages?.appliesTo.includes(type.id) ? pagesById(state.pages) : null;
    const extras = [...state.extras].map(extraById).filter(Boolean);
    const priced = [type, pages, ...extras].filter(Boolean).map((x) => x.price);
    const canPrice = cfg.showPrices && priced.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const money = (n) => `${cfg.currency || 'R'} ${Math.round(n).toLocaleString('en-ZA')}`.replace(/ /g, ' ');
    return {
      type, pages, extras,
      price: canPrice ? `${money(sum(priced, 0))} to ${money(sum(priced, 1))}` : null,
      timeline: type.timeline || null,
    };
  }

  function render() {
    if (!state.type) { result.hidden = true; return; }
    const est = compute();
    const chosen = [est.type.label, est.pages?.label, ...est.extras.map((x) => x.label)].filter(Boolean);
    result.hidden = false;
    result.querySelector('[data-est-price]').textContent = est.price || 'Fixed price after a free call';
    result.querySelector('[data-est-facts]').innerHTML = [
      `Typical timeline: <strong>${e(est.timeline || 'confirmed in your quote')}</strong>`,
      `You pick: <strong>${e(chosen.join(', '))}</strong>`,
      'A working preview link every week, and the code, domain and data are yours',
    ].map((li) => `<li>${li}</li>`).join('');
    result.querySelector('[data-est-sent]').hidden = true;
  }

  typesBox.addEventListener('change', (ev) => {
    state.type = typeById(ev.target.value);
    state.extras = new Set([...state.extras].filter((id) => extraById(id).types.includes(state.type.id)));
    const hasPages = cfg.pages?.appliesTo.includes(state.type.id);
    pagesWrap.hidden = !hasPages;
    state.pages = hasPages ? pagesSel.value : null;
    renderExtras();
    render();
  });
  pagesSel.addEventListener('change', () => { state.pages = pagesSel.value; render(); });
  extrasBox.addEventListener('change', (ev) => {
    if (ev.target.checked) state.extras.add(ev.target.value); else state.extras.delete(ev.target.value);
    render();
  });

  result.querySelector('[data-est-send]').addEventListener('click', () => {
    const est = compute();
    const selection = {
      type: est.type.label,
      pages: est.pages?.label || null,
      extras: est.extras.map((x) => x.label),
      timeline: est.timeline,
      price: est.price,
    };
    const estimate = { service: est.type.service, selection };
    window.__npEstimate = estimate; // read by the enquiry form even if it was not ready yet
    document.dispatchEvent(new CustomEvent('np:estimate', { detail: estimate }));
    result.querySelector('[data-est-sent]').hidden = false;
    document.querySelector('#contact')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}
