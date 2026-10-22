#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Worker (default: wrangler dev on :8787).
 *
 *   npm run dev            (terminal 1)
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:smoke   (terminal 2)
 *
 * Without ADMIN_* variables, only the public checks run.
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const ORIGIN = new URL(BASE).origin;
let passed = 0;
let failed = 0;
let cookie = '';

async function req(method, path, body, extra = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
}

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log(`Smoke testing ${BASE}\n\nPublic`);

await check('home page renders with security headers', async () => {
  const r = await req('GET', '/');
  expect(r.status === 200, `status ${r.status}`);
  expect(r.data.includes('Start a project'), 'missing CTA');
  expect((r.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'missing CSP');
});
await check('work, privacy and admin pages render', async () => {
  for (const p of ['/work', '/privacy', '/admin']) {
    const r = await req('GET', p);
    expect(r.status === 200, `${p} -> ${r.status}`);
  }
});
await check('unknown page returns the 404 page', async () => {
  const r = await req('GET', '/does-not-exist');
  expect(r.status === 404 && r.data.includes('lost the signal'), `status ${r.status}`);
});
await check('health check reports database up', async () => {
  const r = await req('GET', '/api/health');
  expect(r.status === 200 && r.data.db === 'up', JSON.stringify(r.data));
});
await check('showcase lists only published projects', async () => {
  const r = await req('GET', '/api/projects');
  expect(r.status === 200, `status ${r.status}`);
  const slugs = r.data.projects.map((p) => p.slug);
  expect(slugs.includes('worklink'), 'WorkLink missing');
  expect(!slugs.includes('4guard'), '4GUARD draft should be hidden');
  expect(Array.isArray(r.data.projects[0].tech), 'tech should be an array');
});
await check('enquiry validation returns field errors', async () => {
  const r = await req('POST', '/api/enquiries', { name: 'A', email: 'bad', service: 'Nope', message: 'short', consent: false });
  expect(r.status === 422, `status ${r.status}`);
  for (const f of ['name', 'email', 'service', 'message']) expect(r.data.fields[f], `no error for ${f}`);
});
let reference;
await check('valid enquiry is saved and gets a reference', async () => {
  const r = await req('POST', '/api/enquiries', {
    name: 'Smoke Test', email: 'smoke@example.com', phone: '072 000 0000', company: 'Test Co',
    service: 'Business website', budget: 'R5 000 – R15 000', timeline: 'Within 1 month',
    message: 'We need a website with a booking form for our salon in Polokwane.', contact_pref: 'whatsapp', consent: true,
  });
  expect(r.status === 201, `status ${r.status} ${JSON.stringify(r.data)}`);
  expect(/^NP-[A-Z2-9]{6}$/.test(r.data.reference), `bad reference ${r.data.reference}`);
  reference = r.data.reference;
});
await check('honeypot submissions are silently dropped', async () => {
  const r = await req('POST', '/api/enquiries', { website: 'http://spam', name: 'Bot' });
  expect(r.status === 201, `status ${r.status}`);
});
await check('cross-site POST is blocked', async () => {
  const r = await req('POST', '/api/subscribe', { email: 'x@example.com' }, { origin: 'https://evil.example' });
  expect(r.status === 403, `status ${r.status}`);
});
await check('subscribe works and is idempotent', async () => {
  const a = await req('POST', '/api/subscribe', { email: 'Reader@Example.com' });
  const b = await req('POST', '/api/subscribe', { email: 'reader@example.com' });
  expect(a.status === 201 && b.status === 201, `${a.status}/${b.status}`);
});
await check('admin API rejects anonymous requests', async () => {
  const r = await req('GET', '/api/admin/enquiries');
  expect(r.status === 401, `status ${r.status}`);
});
await check('unknown API route returns JSON 404', async () => {
  const r = await req('GET', '/api/nope');
  expect(r.status === 404 && r.data.ok === false, `status ${r.status}`);
});

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  console.log('\nAdmin');
  await check('wrong password is rejected', async () => {
    const r = await req('POST', '/api/admin/login', { email: process.env.ADMIN_EMAIL, password: 'wrong-password' });
    expect(r.status === 401, `status ${r.status}`);
  });
  await check('login sets an HttpOnly SameSite=Strict cookie', async () => {
    const res = await fetch(BASE + '/api/admin/login', {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    const set = res.headers.get('set-cookie') || '';
    expect(res.status === 200, `status ${res.status}`);
    expect(/HttpOnly/i.test(set) && /SameSite=Strict/i.test(set), set);
    cookie = set.split(';')[0];
  });
  let enquiryId;
  await check('stats and enquiry list work', async () => {
    const s = await req('GET', '/api/admin/stats');
    expect(s.status === 200 && s.data.stats.enquiries.total >= 1, JSON.stringify(s.data));
    const l = await req('GET', `/api/admin/enquiries?q=${reference}`);
    expect(l.data.items.length === 1, `found ${l.data.items?.length}`);
    enquiryId = l.data.items[0].id;
  });
  await check('enquiry status and notes update', async () => {
    const r = await req('PATCH', `/api/admin/enquiries/${enquiryId}`, { status: 'contacted', notes: 'Called back.' });
    expect(r.status === 200 && r.data.enquiry.status === 'contacted', JSON.stringify(r.data));
  });
  await check('CSV export downloads', async () => {
    const r = await req('GET', '/api/admin/enquiries.csv');
    expect(r.status === 200 && r.data.includes(reference), 'reference missing from CSV');
  });
  await check('publishing a live project without a URL is refused', async () => {
    const list = await req('GET', '/api/admin/projects');
    const guard = list.data.projects.find((p) => p.slug === '4guard');
    const r = await req('PATCH', `/api/admin/projects/${guard.id}`, { status: 'live', published: true });
    expect(r.status === 422 && r.data.fields.url, JSON.stringify(r.data));
  });
  await check('project create, update, delete', async () => {
    const c = await req('POST', '/api/admin/projects', { name: 'Smoke Project', slug: 'smoke-project', summary: 'A temporary test project.', status: 'coming_soon', tech: ['HTML'] });
    expect(c.status === 201, JSON.stringify(c.data));
    const id = c.data.project.id;
    const dup = await req('POST', '/api/admin/projects', { name: 'Dup', slug: 'smoke-project', summary: 'Duplicate slug test.', status: 'live' });
    expect(dup.status === 409, `duplicate slug status ${dup.status}`);
    const u = await req('PATCH', `/api/admin/projects/${id}`, { status: 'live', url: 'https://example.com', published: true });
    expect(u.status === 200 && u.data.project.published === true, JSON.stringify(u.data));
    const pub = await req('GET', '/api/projects');
    expect(pub.data.projects.some((p) => p.slug === 'smoke-project'), 'not visible publicly after publish');
    const d = await req('DELETE', `/api/admin/projects/${id}`);
    expect(d.status === 200, `delete ${d.status}`);
  });
  await check('test enquiry can be deleted (POPIA erasure)', async () => {
    const r = await req('DELETE', `/api/admin/enquiries/${enquiryId}`);
    expect(r.status === 200, `status ${r.status}`);
  });
  await check('logout ends the session', async () => {
    await req('POST', '/api/admin/logout');
    cookie = cookie.replace(/=.*/, '=');
    const r = await req('GET', '/api/admin/me');
    expect(r.status === 401, `status ${r.status}`);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
