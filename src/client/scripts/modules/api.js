/**
 * Thin fetch wrapper for the Worker API. Always resolves to { ok, status, data }.
 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  try {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body && !isFormData ? { 'content-type': 'application/json' } : {},
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : {};
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection and try again.' } };
  }
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
