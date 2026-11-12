import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callSchema, enquirySchema, loginSchema, projectSchema, testimonialSchema, validate } from '../../src/server/lib/validate.js';

const enquiry = {
  name: 'Thabo', email: 'thabo@example.co.za', service: 'Business website',
  message: 'We need a website for our plumbing business in Mokopane.', consent: true,
};

test('lead source and estimate are optional and validated', () => {
  const plain = validate(enquiry, enquirySchema);
  assert.equal(plain.heard_from, null);
  assert.equal(plain.quote_selection, null);

  const rich = validate({ ...enquiry, heard_from: 'Instagram', utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'launch-ad', quote_selection: '{"type":"Business website","extras":["Care plan"]}' }, enquirySchema);
  assert.equal(rich.heard_from, 'Instagram');
  assert.equal(rich.utm_campaign, 'launch-ad');
  assert.equal(JSON.parse(rich.quote_selection).type, 'Business website');
});

test('bad lead source values are rejected', () => {
  assert.throws(() => validate({ ...enquiry, heard_from: 'A carrier pigeon' }, enquirySchema), /highlighted/);
  assert.throws(() => validate({ ...enquiry, utm_source: '<script>alert(1)</script>' }, enquirySchema), /highlighted/);
  assert.throws(() => validate({ ...enquiry, quote_selection: 'not json' }, enquirySchema), /highlighted/);
  assert.throws(() => validate({ ...enquiry, quote_selection: '[1,2,3]' }, enquirySchema), /highlighted/);
  assert.throws(() => validate({ ...enquiry, quote_selection: JSON.stringify({ x: 'a'.repeat(1600) }) }, enquirySchema), /highlighted/);
});

test('call booking details', () => {
  const ok = validate({ slot: '2026-11-13T07:00:00.000Z', name: 'Lerato', email: 'lerato@example.com', consent: true }, callSchema);
  assert.equal(ok.phone, null);
  assert.equal(ok.topic, null);
  assert.throws(() => validate({ slot: '2026-11-13T07:00:00.000Z', name: 'L', email: 'bad', consent: false }, callSchema), /highlighted/);
  assert.throws(() => validate({ slot: 'x', name: 'Lerato', email: 'lerato@example.com', consent: true, phone: 'call me' }, callSchema), /highlighted/);
});

test('sign-in code accepts six digits with or without a space', () => {
  const base = { email: 'a@b.co', password: 'secret-password' };
  assert.equal(validate({ ...base, code: '123456' }, loginSchema).code, '123456');
  assert.equal(validate({ ...base, code: '123 456' }, loginSchema).code, '123 456');
  assert.equal(validate(base, loginSchema).code, null);
  assert.throws(() => validate({ ...base, code: '12345' }, loginSchema), /highlighted/);
  assert.throws(() => validate({ ...base, code: 'abcdef' }, loginSchema), /highlighted/);
});

test('testimonials need a real quote and name', () => {
  const t = validate({ author_name: 'Sipho', quote: 'They delivered on time and explained everything clearly.', project_id: '3', published: 'on' }, testimonialSchema);
  assert.equal(t.project_id, 3);
  assert.equal(t.published, true);
  assert.equal(t.author_role, null);
  assert.throws(() => validate({ author_name: 'S', quote: 'short' }, testimonialSchema), /highlighted/);
});

test('case study text fields are optional and length-limited', () => {
  const base = { name: 'X Co', slug: 'x-co', summary: 'Long enough summary', status: 'live' };
  const p = validate({ ...base, problem: 'They took bookings by phone.' }, projectSchema);
  assert.equal(p.problem, 'They took bookings by phone.');
  assert.equal(p.results, null);
  assert.throws(() => validate({ ...base, results: 'x'.repeat(2001) }, projectSchema), /highlighted/);
});
