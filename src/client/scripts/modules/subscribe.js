/**
 * Footer "get updates" sign-up.
 */
import { api } from './api.js';

export function initSubscribe() {
  document.querySelectorAll('[data-subscribe]').forEach((form) => {
    const msg = form.querySelector('[data-subscribe-msg]');
    const btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = form.email.value.trim();
      msg.className = 'subscribe__msg';
      if (!email || !form.email.checkValidity()) {
        msg.textContent = 'Enter a valid email address, like name@example.com.';
        msg.classList.add('is-error');
        form.email.focus();
        return;
      }
      btn.classList.add('is-loading');
      const { ok, data } = await api('/api/subscribe', { method: 'POST', body: { email, website: form.website.value } });
      btn.classList.remove('is-loading');
      if (ok) {
        msg.textContent = 'Subscribed. We will email you when we launch new work.';
        msg.classList.add('is-ok');
        form.reset();
      } else {
        msg.textContent = data.fields?.email || data.error || 'Could not subscribe. Try again.';
        msg.classList.add('is-error');
      }
    });
  });
}
