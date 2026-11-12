/**
 * Shows real client quotes from /api/testimonials. The whole section stays hidden until at least one
 * testimonial is published in the admin dashboard, so the page never shows an empty box.
 */
import { api, escapeHtml as e } from './api.js';

export async function initTestimonials() {
  const section = document.querySelector('[data-testimonials]');
  const list = section.querySelector('[data-testimonial-list]');
  const { ok, data } = await api('/api/testimonials');
  if (!ok || !data.testimonials?.length) return;

  list.innerHTML = data.testimonials
    .map(
      (t) => `<figure class="quote">
        <blockquote><p>${e(t.quote)}</p></blockquote>
        <figcaption><strong>${e(t.author_name)}</strong>${t.author_role ? `<span>${e(t.author_role)}</span>` : ''}${
          t.project_slug ? `<a href="/work/${e(t.project_slug)}">About ${e(t.project_name)}</a>` : ''
        }</figcaption>
      </figure>`,
    )
    .join('');
  section.hidden = false;
}
