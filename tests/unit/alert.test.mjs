import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertServerError } from '../../src/server/services/alert.service.js';

/** D1 stand-in: counts how many times the alert slot was claimed in this window. */
function fakeDb() {
  let count = 0;
  return { prepare: () => ({ bind: () => ({ first: async () => ({ count: ++count }) }) }) };
}
const request = new Request('https://example.com/api/enquiries?email=private@example.com', { method: 'POST' });

async function withFetchSpy(fn) {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
  try { await fn(sent); } finally { globalThis.fetch = real; }
}

test('the first server error in 15 minutes emails the owner, later ones do not', async () => {
  await withFetchSpy(async (sent) => {
    const env = { DB: fakeDb(), RESEND_API_KEY: 'k', MAIL_FROM: 'a <a@b.co>', NOTIFY_EMAIL: 'owner@example.com', SITE_URL: 'https://example.com' };
    await alertServerError(env, request, new Error('boom'));
    await alertServerError(env, request, new Error('boom again'));
    await alertServerError(env, request, new Error('and again'));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body.to, ['owner@example.com']);
    assert.ok(sent[0].body.subject.includes('POST /api/enquiries'));
  });
});

test('the alert never contains the query string or visitor details', async () => {
  await withFetchSpy(async (sent) => {
    const env = { DB: fakeDb(), RESEND_API_KEY: 'k', MAIL_FROM: 'a <a@b.co>', NOTIFY_EMAIL: 'owner@example.com', SITE_URL: 'https://example.com' };
    await alertServerError(env, request, new Error('boom'));
    assert.ok(!sent[0].body.html.includes('private@example.com'));
    assert.ok(!sent[0].body.subject.includes('private@example.com'));
  });
});

test('no email key, no database, or a failing email service never throws', async () => {
  await withFetchSpy(async (sent) => {
    await alertServerError({ DB: fakeDb() }, request, new Error('x')); // no RESEND_API_KEY
    await alertServerError({ RESEND_API_KEY: 'k' }, request, new Error('x')); // no DB
    assert.equal(sent.length, 0);
  });
  const real = globalThis.fetch;
  const realError = console.error;
  const logged = [];
  globalThis.fetch = async () => { throw new Error('network down'); };
  console.error = (...args) => logged.push(args); // the failure is logged on purpose; keep the test output quiet
  try {
    await alertServerError({ DB: fakeDb(), RESEND_API_KEY: 'k', MAIL_FROM: 'a <a@b.co>', NOTIFY_EMAIL: 'o@example.com', SITE_URL: 'https://example.com' }, request, new Error('x'));
  } finally { globalThis.fetch = real; console.error = realError; }
  assert.equal(logged.length, 1, 'the failure is logged for you to see with npm run logs');
});
