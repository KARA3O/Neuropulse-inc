#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Worker (default: wrangler dev on :8787).
 *
 *   npm run dev            (terminal 1)
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:smoke   (terminal 2)
 *
 * Without ADMIN_* variables, only the public checks run.
 * If that admin already has two-factor sign-in turned on, also set ADMIN_TOTP_SECRET (the setup key from the
 * authenticator app) so the test can sign in.
 */
import { totpAt } from '../../src/server/lib/totp.js';

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

console.log('\nCase studies, testimonials and call booking');
await check('published project has a server-rendered case-study page', async () => {
  const r = await req('GET', '/work/taskflow');
  expect(r.status === 200, `status ${r.status}`);
  expect(/<title>TaskFlow case study \| Neuropulse Inc\.<\/title>/.test(r.data), 'title not set');
  expect(r.data.includes('rel="canonical" href="') && r.data.includes('/work/taskflow'), 'canonical missing');
  expect(r.data.includes('application/ld+json'), 'structured data missing');
  expect(!r.data.includes('<!--CASE_STUDY-->'), 'template marker left behind');
  expect((r.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'security headers missing');
});
await check('unpublished and unknown case studies are 404', async () => {
  for (const slug of ['valery-boutique', 'lvh-portal', 'nope-nope']) {
    const r = await req('GET', `/work/${slug}`);
    expect(r.status === 404, `${slug} -> ${r.status}`);
  }
  const list = await req('GET', '/work');
  expect(list.status === 200 && list.data.includes('Our work'), '/work list page broken');
});
await check('case-study text reaches the public project API', async () => {
  const r = await req('GET', '/api/projects/taskflow');
  expect(r.status === 200 && 'problem' in r.data.project && 'results' in r.data.project, JSON.stringify(r.data));
});
await check('testimonials endpoint works', async () => {
  const r = await req('GET', '/api/testimonials');
  expect(r.status === 200 && Array.isArray(r.data.testimonials), JSON.stringify(r.data));
});
await check('home page has the new sections and the estimate data file', async () => {
  const home = await req('GET', '/');
  for (const marker of ['data-estimator', 'data-booking', 'data-testimonials', 'neuropulse-ad.mp4', 'name="heard_from"']) expect(home.data.includes(marker), `missing ${marker}`);
  const est = await req('GET', '/estimator.json');
  expect(est.status === 200 && est.data.types?.length >= 3, 'estimator.json missing');
  expect(!JSON.stringify(est.data).includes('_help'), 'help notes leaked into the public file');
  const video = await fetch(BASE + '/assets/video/neuropulse-ad.mp4', { method: 'HEAD' });
  expect(video.status === 200 && (video.headers.get('content-type') || '').includes('video'), `video ${video.status}`);
});
await check('enquiry with lead source and estimate is accepted; bad tags are rejected', async () => {
  const good = await req('POST', '/api/enquiries', {
    name: 'Source Test', email: 'source@example.com', service: 'Booking or e-commerce system', message: 'We need online bookings for our salon in Polokwane.',
    consent: true, heard_from: 'Neuropulse video advert', utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'launch-ad',
    quote_selection: JSON.stringify({ type: 'Booking or online store', extras: ['Online payments (PayFast or Yoco)'], timeline: '4 to 10 weeks', price: null }),
  });
  expect(good.status === 201, `status ${good.status} ${JSON.stringify(good.data)}`);
  const bad = await req('POST', '/api/enquiries', { name: 'Bad Tags', email: 'bad@example.com', service: 'Business website', message: 'Testing a bad tracking tag value here.', consent: true, utm_source: '<script>' });
  expect(bad.status === 422 && bad.data.fields.utm_source, `status ${bad.status}`);
});
let slotIso;
await check('call slots are offered in South African working hours', async () => {
  const r = await req('GET', '/api/calls/slots');
  expect(r.status === 200 && r.data.days.length > 0, JSON.stringify(r.data).slice(0, 200));
  expect(r.data.timezone === 'Africa/Johannesburg', 'wrong timezone');
  slotIso = r.data.days.at(-1).slots.at(-1); // last slot of the last open day: unlikely to clash with a real booking
  expect(!!slotIso, 'no slot');
});
await check('a call can be booked once and a second booking of the same time is refused', async () => {
  const body = { slot: slotIso, name: 'Smoke Caller', email: 'caller@example.com', phone: '072 000 0000', topic: 'Smoke test call', consent: true };
  const a = await req('POST', '/api/calls', body);
  expect(a.status === 201 && /^CALL-[A-Z2-9]{6}$/.test(a.data.reference), `status ${a.status} ${JSON.stringify(a.data)}`);
  expect(a.data.starts_at === slotIso && typeof a.data.label === 'string', 'wrong slot echoed');
  const b = await req('POST', '/api/calls', { ...body, name: 'Second Person', email: 'second@example.com' });
  expect(b.status === 409 && b.data.fields.slot, `second booking status ${b.status}`);
  const after = await req('GET', '/api/calls/slots');
  expect(!after.data.days.some((d) => d.slots.includes(slotIso)), 'booked slot is still offered');
});
await check('invalid call bookings are refused', async () => {
  const base = { name: 'Valid Name', email: 'valid@example.com', consent: true };
  const odd = await req('POST', '/api/calls', { ...base, slot: '2030-01-01T03:00:00.000Z' });
  expect(odd.status === 409, `unoffered time -> ${odd.status}`);
  const bad = await req('POST', '/api/calls', { slot: slotIso, name: 'A', email: 'nope', consent: false });
  expect(bad.status === 422 && bad.data.fields.name && bad.data.fields.email, `status ${bad.status}`);
  const bot = await req('POST', '/api/calls', { website: 'http://spam', name: 'Bot' });
  expect(bot.status === 201, 'honeypot should pretend success');
});
await check('cancel link rejects unknown tokens', async () => {
  const r = await req('GET', '/api/calls/cancel?token=not-a-real-token-123456');
  expect(r.status === 404 && r.data.includes('not valid'), `status ${r.status}`);
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
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
        ...(process.env.ADMIN_TOTP_SECRET ? { code: await totpAt(process.env.ADMIN_TOTP_SECRET) } : {}),
      }),
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
    const u = await req('PATCH', `/api/admin/projects/${id}`, { status: 'live', url: 'https://example.com', published: true, problem: 'They <b>took</b> bookings by phone.', solution: 'We built a booking page.' });
    expect(u.status === 200 && u.data.project.published === true, JSON.stringify(u.data));
    const pub = await req('GET', '/api/projects');
    expect(pub.data.projects.some((p) => p.slug === 'smoke-project'), 'not visible publicly after publish');

    // The case-study page shows the text we wrote (escaped), hides the empty "result" section, and shows a quote once published.
    const page = await req('GET', '/work/smoke-project');
    expect(page.status === 200 && page.data.includes('The challenge') && page.data.includes('What we built'), 'case study text missing');
    expect(page.data.includes('They &lt;b&gt;took&lt;/b&gt; bookings') && !page.data.includes('<b>took</b>'), 'case study text not escaped');
    expect(!page.data.includes('The result'), 'empty result section should be hidden');
    const t = await req('POST', '/api/admin/testimonials', { author_name: 'Smoke Client', author_role: 'Owner', quote: 'Smoke test quote that is long enough.', project_id: id, published: true });
    expect(t.status === 201, `testimonial ${t.status} ${JSON.stringify(t.data)}`);
    const withQuote = await req('GET', '/work/smoke-project');
    expect(withQuote.data.includes('Smoke test quote that is long enough.'), 'published testimonial missing from case study');
    const pubQuotes = await req('GET', '/api/testimonials');
    expect(pubQuotes.data.testimonials.some((q) => q.author_name === 'Smoke Client' && q.project_slug === 'smoke-project'), 'testimonial missing from public list');
    const hide = await req('PATCH', `/api/admin/testimonials/${t.data.testimonial.id}`, { published: false });
    expect(hide.status === 200 && hide.data.testimonial.published === false, 'unpublish failed');
    const hidden = await req('GET', '/api/testimonials');
    expect(!hidden.data.testimonials.some((q) => q.author_name === 'Smoke Client'), 'unpublished testimonial still public');
    const delT = await req('DELETE', `/api/admin/testimonials/${t.data.testimonial.id}`);
    expect(delT.status === 200, `delete testimonial ${delT.status}`);

    const d = await req('DELETE', `/api/admin/projects/${id}`);
    expect(d.status === 200, `delete ${d.status}`);
    expect((await req('GET', '/work/smoke-project')).status === 404, 'deleted project page should be 404');
  });
  await check('dashboard shows lead sources, upcoming calls and the booked test call', async () => {
    const s = await req('GET', '/api/admin/stats');
    expect(s.status === 200 && Array.isArray(s.data.stats.enquiries.sources) && typeof s.data.stats.calls.upcoming === 'number', JSON.stringify(s.data.stats).slice(0, 200));
    expect(s.data.stats.enquiries.sources.some((x) => x.source === 'Neuropulse video advert'), 'lead source not counted');
    const calls = await req('GET', '/api/admin/calls');
    const mine = [...calls.data.upcoming, ...calls.data.past].find((c) => c.name === 'Smoke Caller');
    expect(mine && mine.status === 'confirmed', 'booked call missing in dashboard');
    const done = await req('PATCH', `/api/admin/calls/${mine.id}`, { status: 'completed' });
    expect(done.status === 200, `status ${done.status}`);
    const bad = await req('PATCH', `/api/admin/calls/${mine.id}`, { status: 'exploded' });
    expect(bad.status === 422, `bad status -> ${bad.status}`);
    const del = await req('DELETE', `/api/admin/calls/${mine.id}`);
    expect(del.status === 200, `delete call ${del.status}`);
    const csv = await req('GET', '/api/admin/enquiries.csv');
    expect(csv.data.includes('heard_from') && csv.data.includes('utm_campaign') && csv.data.includes('Neuropulse video advert'), 'CSV missing lead-source columns');
    const q = await req('GET', '/api/admin/enquiries?q=Source%20Test');
    const detail = await req('GET', `/api/admin/enquiries/${q.data.items[0].id}`);
    expect(detail.data.enquiry.utm_campaign === 'launch-ad' && JSON.parse(detail.data.enquiry.quote_selection).type === 'Booking or online store', 'tags or estimate not stored');
    for (const item of q.data.items) await req('DELETE', `/api/admin/enquiries/${item.id}`);
  });
  const twoFactor = await req('GET', '/api/admin/2fa');
  if (twoFactor.data.enabled) {
    console.log('  - two-factor setup test skipped: it is already on for this admin');
  } else {
    await check('two-factor: set up, require the code at sign-in, then turn off', async () => {
      const setup = await req('POST', '/api/admin/2fa/setup', {});
      expect(setup.status === 200 && /^[A-Z2-7]{32}$/.test(setup.data.secret) && setup.data.uri.startsWith('otpauth://'), JSON.stringify(setup.data));
      const wrong = await req('POST', '/api/admin/2fa/enable', { code: '000000' });
      expect(wrong.status === 422, `wrong code -> ${wrong.status}`);
      const on = await req('POST', '/api/admin/2fa/enable', { code: await totpAt(setup.data.secret) });
      expect(on.status === 200 && on.data.enabled === true, JSON.stringify(on.data));
      expect((await req('GET', '/api/admin/me')).data.admin.totp_enabled === true, 'me should report 2FA on');

      const creds = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
      const keep = cookie;
      const noCode = await req('POST', '/api/admin/login', creds);
      expect(noCode.status === 401 && noCode.data.fields?.code, `no code -> ${noCode.status} ${JSON.stringify(noCode.data)}`);
      const badCode = await req('POST', '/api/admin/login', { ...creds, code: '000000' });
      expect(badCode.status === 401 && badCode.data.fields?.code, `bad code -> ${badCode.status}`);
      const goodCode = await req('POST', '/api/admin/login', { ...creds, code: await totpAt(setup.data.secret) });
      expect(goodCode.status === 200, `good code -> ${goodCode.status} ${JSON.stringify(goodCode.data)}`);

      const offWrongPw = await req('POST', '/api/admin/2fa/disable', { password: 'wrong-password', code: await totpAt(setup.data.secret) });
      expect(offWrongPw.status === 422, `disable with wrong password -> ${offWrongPw.status}`);
      const off = await req('POST', '/api/admin/2fa/disable', { password: process.env.ADMIN_PASSWORD, code: await totpAt(setup.data.secret) });
      expect(off.status === 200 && off.data.enabled === false, JSON.stringify(off.data));
      const plain = await req('POST', '/api/admin/login', creds);
      expect(plain.status === 200, `login after turning 2FA off -> ${plain.status}`);
      void keep;
    });
  }
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
