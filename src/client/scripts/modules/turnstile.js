/**
 * Cloudflare Turnstile ("I am human" check), shared by every form.
 * The script is loaded once, and only when the server has a site key configured.
 */
let loading = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error('Turnstile failed to load')); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Show the check inside `container`.
 * @param {(token: string | null) => void} onToken called with the token, or null when it expires
 * @returns {Promise<string | null>} the widget id (for resetTurnstile), or null if it could not load
 */
export async function mountTurnstile(container, siteKey, onToken) {
  if (!siteKey || !container) return null;
  try {
    await loadTurnstile();
    return window.turnstile.render(container, {
      sitekey: siteKey,
      theme: 'dark',
      callback: (t) => onToken(t),
      'expired-callback': () => onToken(null),
    });
  } catch {
    return null;
  }
}

export function resetTurnstile(widgetId) {
  if (widgetId != null && window.turnstile) window.turnstile.reset(widgetId);
}
