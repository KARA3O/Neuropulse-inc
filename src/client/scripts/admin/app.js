/**
 * Admin dashboard (vanilla JS, no framework).
 * Views: login | app (overview, enquiries, projects, subscribers).
 */
import { api, escapeHtml as e } from '../modules/api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STATUS_LABEL = { new: 'New', contacted: 'Contacted', in_progress: 'In progress', won: 'Won', lost: 'Lost', spam: 'Spam' };
const PROJECT_STATUS = { live: 'Live', in_development: 'In development', coming_soon: 'Coming soon' };
const fmtDate = (iso) => new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

const state = { tab: 'overview', enquiries: { status: '', q: '', offset: 0, limit: 25 }, projects: [], currentEnquiry: null, currentProject: null, uploadingImage: false };

// ---- toast ------------------------------------------------------------------------------------
let toastTimer;
function toast(message, isError = false) {
  const t = $('[data-toast]');
  t.textContent = message;
  t.classList.toggle('is-error', isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/** API call that sends the user back to login when the session ends. */
async function call(path, opts) {
  const res = await api(path, opts);
  if (res.status === 401 && !path.endsWith('/login')) { showLogin(); toast('Your session ended. Sign in again.', true); }
  return res;
}

// ---- views ------------------------------------------------------------------------------------
function showLogin() {
  $('[data-view="app"]').hidden = true;
  $('[data-view="login"]').hidden = false;
  $('#l-email').focus();
}

function showApp(admin) {
  $('[data-view="login"]').hidden = true;
  $('[data-view="app"]').hidden = false;
  $('[data-admin-name]').textContent = admin.name;
  const fromHash = location.hash.slice(1);
  switchTab(['overview', 'enquiries', 'projects', 'subscribers'].includes(fromHash) ? fromHash : 'overview');
}

function switchTab(tab) {
  state.tab = tab;
  $$('[data-tab]').forEach((b) => (b.getAttribute('data-tab') === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  history.replaceState(null, '', `#${tab}`);
  ({ overview: loadOverview, enquiries: loadEnquiries, projects: loadProjects, subscribers: loadSubscribers })[tab]();
}

// ---- overview ---------------------------------------------------------------------------------
async function loadOverview() {
  const { ok, data } = await call('/api/admin/stats');
  if (!ok) return;
  const s = data.stats;
  const newCount = s.enquiries.byStatus.new || 0;
  const badge = $('[data-new-count]');
  badge.textContent = newCount;
  badge.hidden = !newCount;

  const tiles = [
    { value: newCount, label: 'New enquiries to answer', accent: newCount > 0 },
    { value: s.enquiries.last7Days, label: 'Enquiries, last 7 days' },
    { value: s.enquiries.last30Days, label: 'Enquiries, last 30 days' },
    { value: s.enquiries.winRate == null ? '—' : `${s.enquiries.winRate}%`, label: 'Win rate (won vs lost)' },
    { value: s.projects.live, label: `Live projects (${s.projects.drafts} draft${s.projects.drafts === 1 ? '' : 's'})` },
    { value: s.subscribers, label: 'Active subscribers' },
  ];
  $('[data-tiles]').innerHTML = tiles
    .map((t) => `<div class="tile${t.accent ? ' tile--accent' : ''}"><div class="tile__value">${e(t.value)}</div><div class="tile__label">${e(t.label)}</div></div>`)
    .join('');

  // 14-day bar chart (fill missing days with 0).
  const byDay = Object.fromEntries(s.enquiries.daily.map((d) => [d.day, d.n]));
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return { key, n: byDay[key] || 0, label: d.toLocaleDateString('en-ZA', { day: 'numeric' }) };
  });
  const max = Math.max(1, ...days.map((d) => d.n));
  $('[data-chart]').innerHTML = days
    .map((d) => `<div class="chart__bar" title="${d.key}: ${d.n}"><b>${d.n || ''}</b><span class="${d.n ? '' : 'is-zero'}" style="height:${(d.n / max) * 100}%"></span><small>${d.label}</small></div>`)
    .join('');

  const describe = (a) => {
    const [entity, ...rest] = a.action.split('.');
    const verb = rest.join(' ').replace('status ', 'marked ').replace('_', ' ');
    return `${e(a.admin_name || 'Someone')} ${e(verb)} ${entity === 'admin' ? '' : `${e(entity)} #${e(a.entity_id || '')}`}`;
  };
  $('[data-activity]').innerHTML = data.activity.length
    ? data.activity.map((a) => `<li><span>${describe(a)}</span><time datetime="${e(a.created_at)}">${fmtDate(a.created_at)}</time></li>`).join('')
    : '<li><span class="muted">No activity yet.</span></li>';
}

// ---- enquiries --------------------------------------------------------------------------------
async function loadEnquiries() {
  const f = state.enquiries;
  const qs = new URLSearchParams({ limit: f.limit, offset: f.offset, ...(f.status ? { status: f.status } : {}), ...(f.q ? { q: f.q } : {}) });
  const { ok, data } = await call(`/api/admin/enquiries?${qs}`);
  const tbody = $('[data-enquiry-rows]');
  if (!ok) { tbody.innerHTML = `<tr><td class="empty" colspan="5">${e(data.error)}</td></tr>`; return; }

  tbody.innerHTML = data.items.length
    ? data.items
        .map(
          (r) => `<tr data-id="${r.id}" tabindex="0">
            <td>${fmtDate(r.created_at)}<small>${e(r.reference)}</small></td>
            <td>${e(r.name)}<small>${e(r.company || r.email)}</small></td>
            <td>${e(r.service)}<small>${e(r.timeline || '')}</small></td>
            <td>${e(r.budget || '—')}</td>
            <td><span class="status status--${e(r.status)}">${STATUS_LABEL[r.status]}</span></td>
          </tr>`,
        )
        .join('')
    : `<tr><td class="empty" colspan="5">${f.status || f.q ? 'No enquiries match this filter.' : 'No enquiries yet. They will appear here as soon as someone sends the form.'}</td></tr>`;

  const from = data.total ? data.offset + 1 : 0;
  const to = Math.min(data.offset + data.limit, data.total);
  $('[data-pager]').innerHTML = `<span>${from}–${to} of ${data.total}</span><div>
    <button class="btn btn--ghost btn--sm" data-page="-1" ${data.offset === 0 ? 'disabled' : ''}>Previous</button>
    <button class="btn btn--ghost btn--sm" data-page="1" ${to >= data.total ? 'disabled' : ''}>Next</button></div>`;
}

async function openEnquiry(id) {
  const { ok, data } = await call(`/api/admin/enquiries/${id}`);
  if (!ok) return toast(data.error, true);
  const q = data.enquiry;
  state.currentEnquiry = q;
  const dlg = $('[data-enquiry-dialog]');
  $('[data-enq-ref]', dlg).textContent = `${q.reference} · received ${fmtDate(q.created_at)}`;
  $('[data-enq-name]', dlg).textContent = q.name;
  const facts = [
    ['Email', `<a href="mailto:${e(q.email)}">${e(q.email)}</a>`],
    ['Phone', q.phone ? `<a href="tel:${e(q.phone)}">${e(q.phone)}</a>` : '—'],
    ['Company', e(q.company || '—')],
    ['Service', e(q.service)],
    ['Budget', e(q.budget || '—')],
    ['Timeline', e(q.timeline || '—')],
    ['Prefers', e(q.contact_pref)],
  ];
  $('[data-enq-facts]', dlg).innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('[data-enq-message]', dlg).textContent = q.message;

  const subject = encodeURIComponent(`Your project enquiry (${q.reference})`);
  const greeting = encodeURIComponent(`Hi ${q.name.split(' ')[0]},\n\nThank you for contacting Neuropulse Inc. about your ${q.service.toLowerCase()} project.\n\n`);
  const intlPhone = (q.phone || '').replace(/[^\d+]/g, '').replace(/^0/, '27').replace(/^\+/, '');
  $('[data-enq-reply]', dlg).innerHTML = [
    `<a class="btn btn--primary btn--sm" href="mailto:${e(q.email)}?subject=${subject}&body=${greeting}">Reply by email</a>`,
    q.phone ? `<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/${e(intlPhone)}?text=${greeting}">WhatsApp</a>` : '',
    q.phone ? `<a class="btn btn--ghost btn--sm" href="tel:${e(q.phone)}">Call</a>` : '',
  ].join('');

  dlg.querySelector('[name="status"]').value = q.status;
  dlg.querySelector('[name="notes"]').value = q.notes || '';
  $('[data-enq-error]', dlg).hidden = true;
  dlg.showModal();
}

async function saveEnquiry() {
  const dlg = $('[data-enquiry-dialog]');
  const body = { status: dlg.querySelector('[name="status"]').value, notes: dlg.querySelector('[name="notes"]').value };
  const { ok, data } = await call(`/api/admin/enquiries/${state.currentEnquiry.id}`, { method: 'PATCH', body });
  if (!ok) { const box = $('[data-enq-error]', dlg); box.textContent = data.error; box.hidden = false; return; }
  dlg.close();
  toast('Enquiry saved');
  loadEnquiries();
}

async function deleteEnquiryNow() {
  if (!confirm('Delete this enquiry permanently? Use this when someone asks for their data to be removed.')) return;
  const { ok, data } = await call(`/api/admin/enquiries/${state.currentEnquiry.id}`, { method: 'DELETE' });
  if (!ok) return toast(data.error, true);
  $('[data-enquiry-dialog]').close();
  toast('Enquiry deleted');
  loadEnquiries();
}

// ---- projects ---------------------------------------------------------------------------------
async function loadProjects() {
  const { ok, data } = await call('/api/admin/projects');
  const box = $('[data-project-rows]');
  if (!ok) { box.innerHTML = `<p class="muted">${e(data.error)}</p>`; return; }
  state.projects = data.projects;
  box.innerHTML = data.projects.length
    ? data.projects
        .map(
          (p) => `<div class="prow" data-pid="${p.id}">
            <span class="prow__swatch" data-swatch="${e(p.accent || '')}"></span>
            <div><h3>${e(p.name)}</h3><p>${e(PROJECT_STATUS[p.status])}${p.client ? ` for ${e(p.client)}` : ''}${p.url ? ` · ${e(p.url.replace(/^https?:\/\//, ''))}` : ''}</p></div>
            <label class="switch"><input type="checkbox" data-publish ${p.published ? 'checked' : ''} aria-label="Published"> Published</label>
            <button class="btn btn--ghost btn--sm" type="button" data-edit>Edit</button>
          </div>`,
        )
        .join('')
    : '<p class="muted">No projects yet. Add your first one.</p>';
  $$('[data-swatch]', box).forEach((s) => { if (/^#[0-9a-f]{6}$/i.test(s.dataset.swatch)) s.style.background = s.dataset.swatch; });
}

function openProject(project) {
  state.currentProject = project || null;
  const dlg = $('[data-project-dialog]');
  const form = $('[data-project-form]', dlg);
  form.reset();
  $$('[data-error-for]', form).forEach((x) => (x.textContent = ''));
  $('[data-proj-error]', dlg).hidden = true;
  $('[data-proj-title]', dlg).textContent = project ? `Edit ${project.name}` : 'Add project';
  $('[data-proj-delete]', dlg).hidden = !project;
  $('[data-image-upload-status]', dlg).textContent = '';
  $('[data-image-upload-status]', dlg).classList.remove('is-error');
  if (project) {
    for (const [k, v] of Object.entries(project)) {
      const el = form.elements[k];
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (k === 'tech') el.value = (v || []).join(', ');
      else el.value = v ?? '';
    }
  }
  updateProjectImagePreview(form.elements.image_url.value);
  dlg.showModal();
}

function updateProjectImagePreview(url) {
  const preview = $('[data-image-preview]');
  preview.hidden = !url;
  if (url) preview.src = url;
  else preview.removeAttribute('src');
}

async function uploadProjectImage(file) {
  const form = $('[data-project-form]');
  const input = $('#p-image-file');
  const submit = form.querySelector('button[type="submit"]');
  const status = $('[data-image-upload-status]');
  const body = new FormData();
  body.append('image', file);
  state.uploadingImage = true;
  input.disabled = true;
  submit.disabled = true;
  $('[data-project-dialog] [data-close]').disabled = true;
  $('[data-proj-delete]').disabled = true;
  status.textContent = 'Uploading screenshot…';
  try {
    const { ok, data } = await call('/api/admin/projects/image', { method: 'POST', body });
    if (!ok) {
      status.textContent = data.error || 'The screenshot could not be uploaded.';
      status.classList.add('is-error');
      return;
    }
    form.elements.image_url.value = data.image_url;
    updateProjectImagePreview(data.image_url);
    status.textContent = 'Screenshot uploaded.';
    status.classList.remove('is-error');
  } finally {
    state.uploadingImage = false;
    input.disabled = false;
    submit.disabled = false;
    $('[data-project-dialog] [data-close]').disabled = false;
    $('[data-proj-delete]').disabled = false;
    input.value = '';
  }
}

async function saveProject(ev) {
  ev.preventDefault();
  const form = ev.target;
  const dlg = $('[data-project-dialog]');
  const f = form.elements;
  const body = {
    name: f.name.value, slug: f.slug.value, client: f.client.value, industry: f.industry.value,
    summary: f.summary.value, description: f.description.value, url: f.url.value, image_url: f.image_url.value,
    tech: f.tech.value.split(',').map((s) => s.trim()).filter(Boolean), status: f.status.value,
    sort_order: f.sort_order.value || 100, accent: f.accent.value.toUpperCase(), launched_at: f.launched_at.value,
    featured: f.featured.checked, published: f.published.checked,
  };
  const p = state.currentProject;
  const { ok, data } = await call(p ? `/api/admin/projects/${p.id}` : '/api/admin/projects', { method: p ? 'PATCH' : 'POST', body });
  $$('[data-error-for]', form).forEach((x) => (x.textContent = ''));
  if (!ok) {
    Object.entries(data.fields || {}).forEach(([k, msg]) => { const slot = $(`[data-error-for="${k}"]`, form); if (slot) slot.textContent = msg; });
    const box = $('[data-proj-error]', dlg); box.textContent = data.error; box.hidden = false;
    return;
  }
  dlg.close();
  toast(p ? 'Project saved' : 'Project added');
  loadProjects();
}

// ---- subscribers ------------------------------------------------------------------------------
async function loadSubscribers() {
  const { ok, data } = await call('/api/admin/subscribers');
  const tbody = $('[data-subscriber-rows]');
  if (!ok) { tbody.innerHTML = `<tr><td class="empty" colspan="3">${e(data.error)}</td></tr>`; return; }
  tbody.innerHTML = data.subscribers.length
    ? data.subscribers.map((s) => `<tr><td>${e(s.email)}</td><td><span class="status status--${e(s.status)}">${s.status === 'active' ? 'Active' : 'Unsubscribed'}</span></td><td>${fmtDay(s.created_at)}</td></tr>`).join('')
    : '<tr><td class="empty" colspan="3">No subscribers yet. The sign-up form is in the website footer.</td></tr>';
}

// ---- wiring -----------------------------------------------------------------------------------
function wire() {
  $('[data-login]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const btn = form.querySelector('button[type="submit"]');
    const err = $('[data-login-error]');
    err.hidden = true;
    btn.classList.add('is-loading');
    const { ok, data } = await api('/api/admin/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
    btn.classList.remove('is-loading');
    if (!ok) { err.textContent = data.fields ? Object.values(data.fields)[0] : data.error; err.hidden = false; return; }
    form.reset();
    showApp(data.admin);
  });

  $('[data-logout]').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); showLogin(); });
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // Enquiries
  $('[data-status-filter]').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-status]');
    if (!b) return;
    $$('[data-status]', ev.currentTarget).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    Object.assign(state.enquiries, { status: b.dataset.status, offset: 0 });
    loadEnquiries();
  });
  let searchTimer;
  $('[data-search]').addEventListener('input', (ev) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { Object.assign(state.enquiries, { q: ev.target.value.trim(), offset: 0 }); loadEnquiries(); }, 300);
  });
  $('[data-pager]').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-page]');
    if (!b) return;
    state.enquiries.offset = Math.max(0, state.enquiries.offset + Number(b.dataset.page) * state.enquiries.limit);
    loadEnquiries();
  });
  const rows = $('[data-enquiry-rows]');
  rows.addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-id]'); if (tr) openEnquiry(tr.dataset.id); });
  rows.addEventListener('keydown', (ev) => { const tr = ev.target.closest('tr[data-id]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openEnquiry(tr.dataset.id); } });
  $('[data-enq-save]').addEventListener('click', saveEnquiry);
  $('[data-enq-delete]').addEventListener('click', deleteEnquiryNow);

  // Projects
  $('[data-new-project]').addEventListener('click', () => openProject(null));
  $('[data-project-form]').addEventListener('submit', saveProject);
  $('[data-project-dialog] [data-close]').addEventListener('click', () => $('[data-project-dialog]').close());
  $('[data-project-dialog]').addEventListener('cancel', (ev) => {
    if (state.uploadingImage) ev.preventDefault();
  });
  $('#p-image').addEventListener('input', (ev) => updateProjectImagePreview(ev.target.value.trim()));
  $('[data-image-preview]').addEventListener('error', (ev) => { ev.currentTarget.hidden = true; });
  $('#p-image-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const status = $('[data-image-upload-status]');
    status.classList.remove('is-error');
    try {
      await uploadProjectImage(file);
    } catch (err) {
      status.textContent = err.message || 'The screenshot could not be uploaded.';
      status.classList.add('is-error');
    }
  });
  const nameInput = $('#p-name');
  nameInput.addEventListener('input', () => {
    if (!state.currentProject) $('#p-slug').value = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  });
  $('[data-project-rows]').addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-pid]');
    if (row && ev.target.closest('[data-edit]')) openProject(state.projects.find((p) => p.id === Number(row.dataset.pid)));
  });
  $('[data-project-rows]').addEventListener('change', async (ev) => {
    if (!ev.target.matches('[data-publish]')) return;
    const row = ev.target.closest('[data-pid]');
    const { ok, data } = await call(`/api/admin/projects/${row.dataset.pid}`, { method: 'PATCH', body: { published: ev.target.checked } });
    if (!ok) { ev.target.checked = !ev.target.checked; return toast(data.fields ? Object.values(data.fields)[0] : data.error, true); }
    toast(ev.target.checked ? 'Published on the website' : 'Hidden from the website');
    loadProjects();
  });
  $('[data-proj-delete]').addEventListener('click', async () => {
    const p = state.currentProject;
    if (!p || !confirm(`Delete ${p.name}? This cannot be undone.`)) return;
    const { ok, data } = await call(`/api/admin/projects/${p.id}`, { method: 'DELETE' });
    if (!ok) return toast(data.error, true);
    $('[data-project-dialog]').close();
    toast('Project deleted');
    loadProjects();
  });
}

wire();
const me = await api('/api/admin/me');
if (me.ok) showApp(me.data.admin);
else showLogin();
