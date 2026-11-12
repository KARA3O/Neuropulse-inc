/**
 * "Book a free 30-minute call": pick a day, pick a time, leave your details.
 * Times come from /api/calls/slots (South Africa time) and are shown in that time zone for everyone.
 */
import { api, escapeHtml as e } from './api.js';
import { mountTurnstile, resetTurnstile } from './turnstile.js';

const TZ = 'Africa/Johannesburg';
const timeFmt = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const longFmt = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const dayParts = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  const f = (opts) => new Intl.DateTimeFormat('en-ZA', { ...opts, timeZone: 'UTC' }).format(d);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
};
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function initBooking() {
  const root = document.querySelector('[data-booking]');
  const pick = root.querySelector('[data-book-pick]');
  const daysBox = root.querySelector('[data-book-days]');
  const timesBox = root.querySelector('[data-book-times]');
  const tzNote = root.querySelector('[data-book-tz]');
  const form = root.querySelector('[data-book-form]');
  const chosen = root.querySelector('[data-book-chosen]');
  const alertBox = root.querySelector('[data-book-alert]');
  const done = root.querySelector('[data-book-done]');
  const submit = form.querySelector('[type="submit"]');
  const state = { days: [], date: null, slot: null, tzLabel: 'South Africa time (SAST)', turnstileToken: null, widget: null };

  const setError = (name, message) => { const slot = form.querySelector(`[data-error-for="${name}"]`); if (slot) slot.textContent = message || ''; };
  const clearErrors = () => { form.querySelectorAll('[data-error-for]').forEach((s) => (s.textContent = '')); alertBox.hidden = true; };

  function renderDays() {
    daysBox.innerHTML = state.days
      .map((d) => {
        const p = dayParts(d.date);
        return `<button type="button" class="slot-day" data-date="${e(d.date)}" aria-pressed="${d.date === state.date}"><small>${e(p.weekday)}</small><strong>${e(p.day)}</strong><span>${e(p.month)}</span></button>`;
      })
      .join('');
  }

  function renderTimes() {
    const day = state.days.find((d) => d.date === state.date);
    timesBox.innerHTML = day
      ? day.slots.map((s) => `<button type="button" class="slot-time" data-slot="${e(s)}" aria-pressed="${s === state.slot}">${e(timeFmt.format(new Date(s)))}</button>`).join('')
      : '';
  }

  async function loadSlots({ keepSelection = false } = {}) {
    const { ok, data } = await api('/api/calls/slots');
    if (!ok) {
      daysBox.innerHTML = '';
      timesBox.innerHTML = `<p class="book__empty">Times could not load right now. Refresh the page, or WhatsApp us to arrange a call.</p>`;
      return;
    }
    state.days = data.days;
    state.tzLabel = data.timezoneLabel || state.tzLabel;
    tzNote.textContent = `All times are in ${state.tzLabel}. Each call is ${data.slotMinutes || 30} minutes.`;
    if (!keepSelection || !state.days.some((d) => d.slots.includes(state.slot))) { state.slot = null; state.date = state.days[0]?.date || null; }
    if (!state.days.length) {
      daysBox.innerHTML = '';
      timesBox.innerHTML = `<p class="book__empty">No call times are open right now. Send us an enquiry or WhatsApp us and we will arrange one.</p>`;
      return;
    }
    renderDays();
    renderTimes();
  }

  function showStep(step) {
    pick.hidden = step !== 'pick';
    form.hidden = step !== 'form';
    done.hidden = step !== 'done';
  }

  daysBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-date]');
    if (!b) return;
    state.date = b.dataset.date;
    state.slot = null;
    renderDays();
    renderTimes();
  });

  timesBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-slot]');
    if (!b) return;
    state.slot = b.dataset.slot;
    chosen.querySelector('[data-book-when]').textContent = longFmt.format(new Date(state.slot));
    clearErrors();
    showStep('form');
    form.elements.name.focus({ preventScroll: true });
  });

  form.querySelector('[data-book-change]').addEventListener('click', async () => {
    showStep('pick');
    await loadSlots({ keepSelection: true });
    renderTimes();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors();
    const f = form.elements;
    let bad = null;
    const fail = (name, msg) => { setError(name, msg); bad ||= name; };
    if (f.name.value.trim().length < 2) fail('name', 'Enter your name.');
    if (!f.email.checkValidity() || !f.email.value.trim()) fail('email', 'Enter a valid email address, like name@example.com.');
    if (f.phone.value.trim() && !/^[+\d][\d\s()-]{6,19}$/.test(f.phone.value.trim())) fail('phone', 'Enter a phone number like 072 123 4567.');
    if (!f.consent.checked) fail('consent', 'Tick the box so we may use your details to contact you.');
    if (bad) { f[bad].focus(); return; }

    submit.classList.add('is-loading');
    submit.disabled = true;
    const { ok, data } = await api('/api/calls', {
      method: 'POST',
      body: {
        slot: state.slot, name: f.name.value, email: f.email.value, phone: f.phone.value, company: f.company.value, topic: f.topic.value,
        consent: f.consent.checked, website: f.website.value, turnstileToken: state.turnstileToken,
      },
    });
    submit.classList.remove('is-loading');
    submit.disabled = false;

    if (ok) {
      const end = new Date(new Date(data.starts_at).getTime() + 30 * 60_000).toISOString();
      const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Free call with Neuropulse Inc.')}&dates=${stamp(data.starts_at)}/${stamp(end)}&details=${encodeURIComponent(`Reference ${data.reference}. Neuropulse Inc. will contact you at this time.`)}`;
      done.querySelector('[data-book-label]').textContent = `${data.label}, ${data.timezoneLabel || state.tzLabel}`;
      done.querySelector('[data-book-ref]').textContent = data.reference;
      done.querySelector('[data-book-mail]').textContent = data.confirmationEmail
        ? `We have emailed your confirmation to ${f.email.value.trim()}, with a calendar file and a link to cancel.`
        : 'Save this reference or take a screenshot. If your plans change, WhatsApp us and we will move the call.';
      done.querySelector('[data-book-gcal]').href = gcal;
      form.reset();
      showStep('done');
      done.focus();
      return;
    }

    if (data.fields?.slot) {
      // Someone took the time a moment earlier: go back to the list with fresh availability.
      showStep('pick');
      await loadSlots();
      timesBox.insertAdjacentHTML('beforebegin', `<p class="form-alert" role="alert" data-book-stale>${e(data.error)}</p>`);
      setTimeout(() => root.querySelector('[data-book-stale]')?.remove(), 6000);
    } else {
      Object.entries(data.fields || {}).forEach(([k, msg]) => setError(k, msg));
      alertBox.textContent = data.error || 'We could not book that call. Try again, or WhatsApp us.';
      alertBox.hidden = false;
    }
    resetTurnstile(state.widget);
    state.turnstileToken = null;
  });

  root.querySelector('[data-book-another]').addEventListener('click', async () => {
    showStep('pick');
    await loadSlots();
  });

  await loadSlots();
  showStep('pick');

  const cfg = await api('/api/config');
  if (cfg.ok && cfg.data.turnstileSiteKey) {
    state.widget = await mountTurnstile(form.querySelector('[data-turnstile]'), cfg.data.turnstileSiteKey, (t) => (state.turnstileToken = t));
  }
}
