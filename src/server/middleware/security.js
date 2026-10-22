/**
 * Request guards applied before any route runs.
 */
import { HttpError } from '../lib/http.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection: state-changing requests must come from this site.
 * Browsers always send Origin on cross-site POST/PATCH/DELETE, so a mismatch means
 * another site is trying to submit on the visitor's behalf.
 */
export function assertSameOrigin(request, url) {
  if (!UNSAFE.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) {
    // Non-browser clients (curl, tests) send no Origin. Allow, but require JSON so a plain
    // HTML form from another site can't reach us.
    if (!(request.headers.get('content-type') || '').includes('application/json') && request.method !== 'DELETE') {
      throw new HttpError(403, 'Request blocked.');
    }
    return;
  }
  if (origin !== url.origin) throw new HttpError(403, 'Request blocked: it did not come from this website.');
}
