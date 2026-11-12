/**
 * Neuropulse Inc. — Cloudflare Worker entry point.
 *
 * Static pages are served by Workers Static Assets before this code runs.
 * This Worker handles /api/*, uploaded images (/media/*), the server-rendered case-study pages
 * (/work/<slug>; see run_worker_first in wrangler.jsonc) and the daily cron.
 */
import { Router } from './router.js';
import { errorResponse, HttpError } from './lib/http.js';
import { assertSameOrigin } from './middleware/security.js';
import { purgeRateLimits } from './middleware/rate-limit.js';
import { purgeExpiredSessions } from './repositories/admins.repo.js';
import { purgeOldRecords } from './repositories/retention.repo.js';
import { registerPublicRoutes } from './routes/public.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';
import { renderCaseStudy } from './pages/case-study.js';
import { alertServerError } from './services/alert.service.js';

const router = new Router();
registerPublicRoutes(router);
registerAdminRoutes(router);

const CASE_STUDY_PATH = /^\/work\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Case-study pages are rendered here (so Google sees the text); everything else under /work is static.
    const caseStudy = url.pathname.match(CASE_STUDY_PATH);
    if (caseStudy) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
      try {
        if (!env.DB) throw new HttpError(503, 'The database is not connected. Check the D1 binding in wrangler.jsonc.');
        return await renderCaseStudy(env, request, caseStudy[1]);
      } catch (err) {
        if (!(err instanceof HttpError)) ctx.waitUntil(alertServerError(env, request, err));
        return errorResponse(err);
      }
    }

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
      // Unexpected failures (not the friendly 4xx errors above) email you, at most once per 15 minutes.
      if (!(err instanceof HttpError)) ctx.waitUntil(alertServerError(env, request, err));
      return errorResponse(err);
    }
  },

  /** Daily housekeeping (see "triggers" in wrangler.jsonc). */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          await Promise.all([purgeExpiredSessions(env.DB), purgeRateLimits(env.DB)]);
          const removed = await purgeOldRecords(env.DB);
          console.log(`[retention] removed ${removed.enquiries} old enquiries, ${removed.calls} old call bookings, ${removed.auditEntries} old audit entries`);
        } catch (err) {
          console.error('[cron] daily housekeeping failed', err);
          throw err;
        }
      })(),
    );
  },
};
