/**
 * Admin API: everything under /api/admin requires a valid session, except login.
 *
 *   POST   /api/admin/login              sign in (sets HttpOnly cookie)
 *   POST   /api/admin/logout             sign out
 *   GET    /api/admin/me                 current admin
 *   GET    /api/admin/stats              dashboard numbers + recent activity
 *   GET    /api/admin/enquiries          list (?status=&q=&limit=&offset=)
 *   GET    /api/admin/enquiries.csv      export all enquiries
 *   GET    /api/admin/enquiries/:id      one enquiry
 *   PATCH  /api/admin/enquiries/:id      update status / notes
 *   DELETE /api/admin/enquiries/:id      delete (POPIA erasure requests)
 *   GET    /api/admin/projects           all projects incl. drafts
 *   POST   /api/admin/projects           create
 *   PATCH  /api/admin/projects/:id       update
 *   DELETE /api/admin/projects/:id       delete
 *   GET    /api/admin/subscribers        list
 *   GET    /api/admin/subscribers.csv    export
 */
import { clientIp, csvResponse, HttpError, json, readFormData, readJson } from '../lib/http.js';
import { getProjectImageFormat, MAX_PROJECT_IMAGE_BYTES, MAX_PROJECT_IMAGE_REQUEST_BYTES } from '../lib/project-images.js';
import { enquiryUpdateSchema, ENQUIRY_STATUSES, loginSchema, projectSchema, validate } from '../lib/validate.js';
import { hashIp } from '../lib/crypto.js';
import { readCookie, requireAdmin, SESSION_COOKIE, sessionCookie } from '../middleware/auth.js';
import { enforceRateLimit } from '../middleware/rate-limit.js';
import { audit, recentAudit } from '../repositories/admins.repo.js';
import { dashboardStats, deleteEnquiry, exportEnquiries, findEnquiry, listEnquiries, updateEnquiry } from '../repositories/enquiries.repo.js';
import { createProject, deleteProject, findById, listAll, slugTaken, updateProject } from '../repositories/projects.repo.js';
import { listSubscribers } from '../repositories/subscribers.repo.js';
import { login, logout } from '../services/auth.service.js';

const toId = (s) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found.');
  return n;
};

/** Wrap a handler so it only runs for a signed-in admin. */
const guarded = (handler) => async (ctx) => {
  await requireAdmin(ctx);
  return handler(ctx);
};

/** @param {import('../router.js').Router} r */
export function registerAdminRoutes(r) {
  // ---- Session ------------------------------------------------------------------------------
  r.post('/api/admin/login', async ({ request, env, url }) => {
    await enforceRateLimit(env.DB, 'login', await hashIp(clientIp(request), env.IP_SALT));
    const { email, password } = validate(await readJson(request, 2048), loginSchema);
    const { token, admin, maxAge } = await login(env.DB, email.toLowerCase(), password);
    return json({ ok: true, admin }, 200, { 'set-cookie': sessionCookie(token, url, maxAge) });
  });

  r.post('/api/admin/logout', async ({ request, env, url }) => {
    await logout(env.DB, readCookie(request, SESSION_COOKIE));
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', url, 0) });
  });

  r.get('/api/admin/me', guarded(({ admin }) => json({ ok: true, admin: { id: admin.id, name: admin.name, email: admin.email } })));

  r.get('/api/admin/stats', guarded(async ({ env }) => {
    const [stats, activity] = await Promise.all([dashboardStats(env.DB), recentAudit(env.DB, 12)]);
    return json({ ok: true, stats, activity });
  }));

  // ---- Enquiries ----------------------------------------------------------------------------
  r.get('/api/admin/enquiries.csv', guarded(async ({ env }) => {
    const rows = await exportEnquiries(env.DB);
    const cols = ['reference', 'created_at', 'status', 'name', 'email', 'phone', 'company', 'service', 'budget', 'timeline', 'contact_pref', 'message', 'notes'];
    return csvResponse(`neuropulse-enquiries-${new Date().toISOString().slice(0, 10)}.csv`, cols, rows.map((r) => cols.map((c) => r[c])));
  }));

  r.get('/api/admin/enquiries', guarded(async ({ env, url }) => {
    const p = url.searchParams;
    const status = p.get('status');
    if (status && !ENQUIRY_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status filter.');
    const result = await listEnquiries(env.DB, {
      status: status || undefined,
      q: (p.get('q') || '').trim().slice(0, 80) || undefined,
      limit: Number(p.get('limit')) || 25,
      offset: Number(p.get('offset')) || 0,
    });
    return json({ ok: true, ...result });
  }));

  r.get('/api/admin/enquiries/:id', guarded(async ({ env, params }) => {
    const enquiry = await findEnquiry(env.DB, toId(params.id));
    if (!enquiry) throw new HttpError(404, 'That enquiry no longer exists.');
    delete enquiry.ip_hash;
    return json({ ok: true, enquiry });
  }));

  r.patch('/api/admin/enquiries/:id', guarded(async ({ env, params, request, admin }) => {
    const id = toId(params.id);
    if (!(await findEnquiry(env.DB, id))) throw new HttpError(404, 'That enquiry no longer exists.');
    const data = validate(await readJson(request), enquiryUpdateSchema, { partial: true });
    await updateEnquiry(env.DB, id, data);
    await audit(env.DB, admin.id, data.status ? `enquiry.status.${data.status}` : 'enquiry.notes', 'enquiry', id);
    return json({ ok: true, enquiry: await findEnquiry(env.DB, id) });
  }));

  r.delete('/api/admin/enquiries/:id', guarded(async ({ env, params, admin }) => {
    const id = toId(params.id);
    await deleteEnquiry(env.DB, id);
    await audit(env.DB, admin.id, 'enquiry.delete', 'enquiry', id);
    return json({ ok: true });
  }));

  // ---- Projects -----------------------------------------------------------------------------
  r.get('/api/admin/projects', guarded(async ({ env }) => json({ ok: true, projects: await listAll(env.DB) })));

  r.post('/api/admin/projects/image', guarded(async ({ request, env }) => {
    if (!env.PROJECT_IMAGES) throw new HttpError(503, 'Project image storage is not configured. Check the R2 binding.');
    const form = await readFormData(request, MAX_PROJECT_IMAGE_REQUEST_BYTES);
    const files = form.getAll('image');
    const image = files[0];
    if (files.length !== 1 || typeof image === 'string' || !image) {
      throw new HttpError(422, 'Choose one image to upload.', { image: 'Choose one image to upload.' });
    }
    if (image.size === 0) throw new HttpError(422, 'The selected image is empty.', { image: 'Choose a non-empty image.' });
    if (image.size > MAX_PROJECT_IMAGE_BYTES) throw new HttpError(413, 'Images must be 5 MB or smaller.');

    const bytes = new Uint8Array(await image.arrayBuffer());
    const format = getProjectImageFormat(image.type, bytes);
    const filename = `${crypto.randomUUID()}.${format.extension}`;
    const key = `projects/${filename}`;
    await env.PROJECT_IMAGES.put(key, bytes, {
      httpMetadata: {
        contentType: format.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return json({ ok: true, image_url: `/media/projects/${filename}` }, 201);
  }));

  r.post('/api/admin/projects', guarded(async ({ env, request, admin }) => {
    const data = validate(await readJson(request), projectSchema);
    if (await slugTaken(env.DB, data.slug)) throw new HttpError(409, 'Another project already uses that slug.', { slug: 'Choose a different slug.' });
    if (data.status === 'live' && data.published && !data.url) throw new HttpError(422, 'Please fix the highlighted fields.', { url: 'A live, published project needs its website link.' });
    const id = await createProject(env.DB, data);
    await audit(env.DB, admin.id, 'project.create', 'project', id);
    return json({ ok: true, project: await findById(env.DB, id) }, 201);
  }));

  r.patch('/api/admin/projects/:id', guarded(async ({ env, params, request, admin }) => {
    const id = toId(params.id);
    const existing = await findById(env.DB, id);
    if (!existing) throw new HttpError(404, 'That project no longer exists.');
    const data = validate(await readJson(request), projectSchema, { partial: true });
    if (data.slug && (await slugTaken(env.DB, data.slug, id))) throw new HttpError(409, 'Another project already uses that slug.', { slug: 'Choose a different slug.' });
    const merged = { ...existing, ...data };
    if (merged.status === 'live' && merged.published && !merged.url) throw new HttpError(422, 'Please fix the highlighted fields.', { url: 'A live, published project needs its website link.' });
    await updateProject(env.DB, id, data);
    await audit(env.DB, admin.id, 'published' in data && data.published !== existing.published ? (data.published ? 'project.publish' : 'project.unpublish') : 'project.update', 'project', id);
    return json({ ok: true, project: await findById(env.DB, id) });
  }));

  r.delete('/api/admin/projects/:id', guarded(async ({ env, params, admin }) => {
    const id = toId(params.id);
    await deleteProject(env.DB, id);
    await audit(env.DB, admin.id, 'project.delete', 'project', id);
    return json({ ok: true });
  }));

  // ---- Subscribers --------------------------------------------------------------------------
  r.get('/api/admin/subscribers', guarded(async ({ env }) => json({ ok: true, subscribers: await listSubscribers(env.DB) })));

  r.get('/api/admin/subscribers.csv', guarded(async ({ env }) => {
    const rows = await listSubscribers(env.DB);
    return csvResponse('neuropulse-subscribers.csv', ['email', 'status', 'created_at'], rows.map((s) => [s.email, s.status, s.created_at]));
  }));
}
