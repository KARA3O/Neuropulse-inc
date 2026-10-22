/**
 * "Start a project" multi-step form.
 *  - validates each step before moving on
 *  - keeps an unsent draft in this browser (localStorage) so a refresh doesn't lose it
 *  - loads Cloudflare Turnstile only when the server has a site key configured
 *  - maps server-side field errors back to the right step
 */
import { api } from './api.js';

const DRAFT_KEY = 'np-brief-draft';
const STEP_FIELDS = { 1: ['service', 'budget', 'timeline'], 2: ['message', 'company'], 3: ['name', 'email', 'phone', 'contact_pref', 'consent'] };
const TOTAL = 3;

export async function initBrief() {
  const root = document.querySelector('[data-brief]');
  const form = root.querySelector('[data-brief-form]');
  const done = root.querySelector('[data-brief-done]');
  const steps = [...form.querySelectorAll('[data-step]')];
  const btnBack = form.querySelector('[data-back]');
  const btnNext = form.querySelector('[data-next]');
  const btnSubmit = form.querySelector('[data-submit]');
  const bar = form.querySelector('[data-brief-bar]');
  const count = form.querySelector('[data-brief-count]');
  const alertBox = form.querySelector('[data-form-alert]');
  const counter = form.querySelector('[data-counter]');
  let current = 1;
  let turnstileToken = null;

  // ---- helpers ----
  const fieldEl = (name) => form.elements[name];
  const setError = (name, message) => {
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    if (slot) slot.textContent = message || '';
    const el = fieldEl(name);
    if (el && el.classList && !(el instanceof RadioNodeList)) {
      el.classList.toggle('is-invalid', !!message);
      el.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (slot && message) { slot.id = slot.id || `err-${name}`; el.setAttribute('aria-describedby', slot.id); }
    }
  };
  const clearErrors = () => {
    form.querySelectorAll('[data-error-for]').forEach((s) => (s.textContent = ''));
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    alertBox.hidden = true;
  };

  const show = (n, focus = true) => {
    current = n;
    steps.forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    btnBack.hidden = n === 1;
    btnNext.hidden = n === TOTAL;
    btnSubmit.hidden = n !== TOTAL;
    bar.style.width = `${(n / TOTAL) * 100}%`;
    count.textContent = `Step ${n} of ${TOTAL}`;
    if (focus) steps[n - 1].querySelector('input:not(.hp), textarea, select')?.focus({ preventScroll: true });
  };

  const validateStep = (n) => {
    clearErrors();
    let firstBad = null;
    const bad = (name, msg) => { setError(name, msg); firstBad ||= name; };
    const v = (name) => (fieldEl(name)?.value ?? '').trim();

    if (n === 1 && !v('service')) bad('service', 'Choose the option closest to what you need.');
    if (n === 2) {
      if (v('message').length < 20) bad('message', 'Add a little more detail (at least 20 characters) so we can quote properly.');
    }
    if (n === 3) {
      if (v('name').length < 2) bad('name', 'Enter your name.');
      if (!fieldEl('email').checkValidity() || !v('email')) bad('email', 'Enter a valid email address, like name@example.com.');
      if (v('phone') && !/^[+\d][\d\s()-]{6,19}$/.test(v('phone'))) bad('phone', 'Enter a phone number like 072 123 4567.');
      if (fieldEl('contact_pref').value !== 'email' && !v('phone')) bad('phone', 'Add a phone number so we can WhatsApp or call you.');
      if (!fieldEl('consent').checked) bad('consent', 'Tick the box so we may use your details to reply.');
    }
    if (firstBad) {
      const el = fieldEl(firstBad);
      (el instanceof RadioNodeList ? el[0] : el)?.focus();
      return false;
    }
    return true;
  };

  // ---- draft persistence (per-browser convenience only) ----
  const saveDraft = () => {
    try {
      const data = Object.fromEntries(new FormData(form));
      delete data.website; delete data.consent;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch { /* storage unavailable: ignore */ }
  };
  const loadDraft = () => {
    try {
      const data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!data) return;
      for (const [k, val] of Object.entries(data)) {
        const el = fieldEl(k);
        if (!el) continue;
        if (el instanceof RadioNodeList) [...el].forEach((r) => (r.checked = r.value === val));
        else el.value = val;
      }
    } catch { /* ignore */ }
  };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

  const updateCounter = () => { counter.textContent = `${fieldEl('message').value.length} / 4000`; };

  // ---- events ----
  form.addEventListener('input', () => { saveDraft(); updateCounter(); });
  form.addEventListener('change', saveDraft);
  btnNext.addEventListener('click', () => { if (validateStep(current)) show(current + 1); });
  btnBack.addEventListener('click', () => { clearErrors(); show(current - 1); });

  // Enter in a text input moves forward instead of submitting early.
  form.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && current < TOTAL) { ev.preventDefault(); btnNext.click(); }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (current !== TOTAL || !validateStep(TOTAL)) return;

    const fd = new FormData(form);
    const body = {
      ...Object.fromEntries(fd),
      consent: fieldEl('consent').checked,
      source_page: location.pathname,
      turnstileToken,
    };

    btnSubmit.classList.add('is-loading');
    btnSubmit.disabled = true;
    const { ok, data } = await api('/api/enquiries', { method: 'POST', body });
    btnSubmit.classList.remove('is-loading');
    btnSubmit.disabled = false;

    if (ok) {
      clearDraft();
      root.querySelector('[data-reference]').textContent = data.reference;
      form.hidden = true;
      done.hidden = false;
      done.focus();
      return;
    }

    if (data.fields) {
      // Jump to the earliest step that has an error.
      const names = Object.keys(data.fields);
      const step = Number(Object.entries(STEP_FIELDS).find(([, f]) => f.some((x) => names.includes(x)))?.[0] || TOTAL);
      show(step, false);
      clearErrors();
      names.forEach((n) => setError(n, data.fields[n]));
    }
    alertBox.textContent = data.error || 'Your enquiry could not be sent. Try again, or email us directly.';
    alertBox.hidden = false;
    if (window.turnstile) { window.turnstile.reset(); turnstileToken = null; }
  });

  root.querySelector('[data-restart]').addEventListener('click', () => {
    form.reset();
    updateCounter();
    done.hidden = true;
    form.hidden = false;
    show(1);
  });

  loadDraft();
  updateCounter();
  show(1, false);

  // ---- optional Turnstile ----
  const { ok, data } = await api('/api/config');
  if (ok && data.turnstileSiteKey) {
    window.onNpTurnstile = () => {
      window.turnstile.render(form.querySelector('[data-turnstile]'), {
        sitekey: data.turnstileSiteKey,
        theme: 'dark',
        callback: (t) => { turnstileToken = t; },
        'expired-callback': () => { turnstileToken = null; },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onNpTurnstile&render=explicit';
    s.async = true;
    document.head.appendChild(s);
  }
}
