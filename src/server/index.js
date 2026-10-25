/**
 * Neuropulse Inc. — Cloudflare Worker entry point.
 *
 * Static pages are served by Workers Static Assets before this code runs.
 * This Worker only handles /api/* (see run_worker_first in wrangler.jsonc) plus the daily cron.
 */
import { Router } from './router.js';
import { errorResponse, HttpError } from './lib/http.js';
import { assertSameOrigin } from './middleware/security.js';
import { purgeRateLimits } from './middleware/rate-limit.js';
import { purgeExpiredSessions } from './repositories/admins.repo.js';
import { registerPublicRoutes } from './routes/public.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';

const router = new Router();
registerPublicRoutes(router);
registerAdminRoutes(router);

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/media/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        if (!env.DB) throw new HttpError(503, 'The database is not connected. Check the D1 binding in wrangler.jsonc.');
        assertSameOrigin(request, url);
      }
      const { handler, params } = router.match(request.method, url.pathname);
      return await handler({ request, env, url, params, waitUntil: (p) => ctx.waitUntil(p) });
    } catch (err) {
      return errorResponse(err);
    }
  },

  /** Daily housekeeping (see "triggers" in wrangler.jsonc). */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([purgeExpiredSessions(env.DB), purgeRateLimits(env.DB)]));
  },
};
