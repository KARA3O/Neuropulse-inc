import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFormData } from '../../src/server/lib/http.js';
import {
  getProjectImageFormat,
  MAX_PROJECT_IMAGE_BYTES,
  MAX_PROJECT_IMAGE_REQUEST_BYTES,
} from '../../src/server/lib/project-images.js';
import { Router } from '../../src/server/router.js';
import { registerAdminRoutes } from '../../src/server/routes/admin.routes.js';
import { registerPublicRoutes } from '../../src/server/routes/public.routes.js';

const imageBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);

test('project image formats require matching signatures', () => {
  assert.equal(getProjectImageFormat('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0x00])).extension, 'jpg');
  assert.equal(getProjectImageFormat('image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).extension, 'png');
  assert.equal(getProjectImageFormat('image/webp', new TextEncoder().encode('RIFFxxxxWEBP')).extension, 'webp');
  assert.throws(() => getProjectImageFormat('image/png', Uint8Array.from([0xff, 0xd8, 0xff])), (err) => err.status === 415);
  assert.throws(() => getProjectImageFormat('image/svg+xml', new TextEncoder().encode('<svg/>')), (err) => err.status === 415);
});

test('multipart requests are parsed within the configured upload limit', async () => {
  const form = new FormData();
  form.append('image', new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'screenshot.jpg');
  const request = new Request('https://example.com/api/admin/projects/image', { method: 'POST', body: form });
  const parsed = await readFormData(request, MAX_PROJECT_IMAGE_REQUEST_BYTES);
  assert.equal(parsed.get('image').type, 'image/jpeg');
  assert.equal(parsed.get('image').size, 3);
});

test('project image upload limits are five megabytes plus multipart framing', () => {
  assert.equal(MAX_PROJECT_IMAGE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_PROJECT_IMAGE_REQUEST_BYTES, MAX_PROJECT_IMAGE_BYTES + 64 * 1024);
});

test('multipart requests over the cap are rejected before parsing', async () => {
  const form = new FormData();
  form.append('image', new Blob(['too large']), 'large.jpg');
  const request = new Request('https://example.com/api/admin/projects/image', { method: 'POST', body: form });
  await assert.rejects(readFormData(request, 1), (err) => err.status === 413);
});

test('project image upload requires admin and stores a verified image in R2', async () => {
  const router = new Router();
  registerAdminRoutes(router);
  const stored = [];
  const env = {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => ({ id: 7, email: 'admin@example.com', name: 'Admin' }) }) }),
    },
    PROJECT_IMAGES: {
      put: async (...args) => stored.push(args),
    },
  };
  const form = new FormData();
  form.append('image', new Blob([imageBytes], { type: 'image/jpeg' }), 'screenshot.jpg');
  const url = 'https://example.com/api/admin/projects/image';
  const request = new Request(url, { method: 'POST', headers: { cookie: 'np_session=test-session' }, body: form });
  const { handler, params } = router.match('POST', new URL(url).pathname);

  const response = await handler({ request, env, params });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.match(result.image_url, /^\/media\/projects\/[\da-f-]{36}\.jpg$/i);
  assert.equal(stored.length, 1);
  assert.equal(stored[0][0], `projects/${result.image_url.split('/').at(-1)}`);
  assert.deepEqual([...stored[0][1]], [...imageBytes]);
  assert.equal(stored[0][2].httpMetadata.contentType, 'image/jpeg');
  await assert.rejects(
    handler({ request: new Request(url, { method: 'POST', body: form }), env, params }),
    (err) => err.status === 401,
  );
});

test('public screenshot route serves only generated image filenames', async () => {
  const router = new Router();
  registerPublicRoutes(router);
  const env = {
    PROJECT_IMAGES: {
      get: async (key) => ({
        body: new Blob([imageBytes]).stream(),
        httpEtag: '"test-etag"',
        writeHttpMetadata: (headers) => headers.set('content-type', 'image/jpeg'),
        key,
      }),
    },
  };
  const filename = '123e4567-e89b-12d3-a456-426614174000.jpg';
  const route = router.match('GET', `/media/projects/${filename}`);
  const response = await route.handler({ env, params: route.params });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...imageBytes]);
  assert.throws(() => router.match('GET', '/media/projects/../../secret'), (err) => err.status === 404);
});
