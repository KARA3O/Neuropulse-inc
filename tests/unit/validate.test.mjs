import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enquirySchema, isEmail, projectSchema, validate } from '../../src/server/lib/validate.js';
import { HttpError } from '../../src/server/lib/http.js';

const good = {
  name: '  Thabo  ', email: 'thabo@example.co.za', service: 'Business website',
  message: 'We need a website for our plumbing business in Mokopane.', consent: true,
};

test('valid enquiry is trimmed and optional fields become null', () => {
  const out = validate(good, enquirySchema);
  assert.equal(out.name, 'Thabo');
  assert.equal(out.phone, null);
  assert.equal(out.source_page, null);
  assert.equal(out.contact_pref, 'email');
  assert.equal(out.consent, true);
});

test('all problems are reported at once', () => {
  try {
    validate({ name: 'A', email: 'nope', service: 'Hacking', message: 'hi' }, enquirySchema);
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 422);
    assert.deepEqual(Object.keys(err.fields).sort(), ['consent', 'email', 'message', 'name', 'service']);
  }
});

test('control characters are stripped', () => {
  const out = validate({ ...good, name: 'Le\u0000rato' }, enquirySchema);
  assert.equal(out.name, 'Lerato');
});

test('phone format is checked', () => {
  assert.throws(() => validate({ ...good, phone: 'call me' }, enquirySchema), /highlighted/);
  assert.equal(validate({ ...good, phone: '+27 72 721 6200' }, enquirySchema).phone, '+27 72 721 6200');
});

test('partial validation only checks provided fields', () => {
  const out = validate({ status: 'live' }, projectSchema, { partial: true });
  assert.deepEqual(out, { status: 'live' });
});

test('project slug and url rules', () => {
  assert.throws(() => validate({ name: 'X Co', slug: 'Bad Slug', summary: 'Long enough summary', status: 'live' }, projectSchema));
  assert.throws(() => validate({ name: 'X Co', slug: 'x-co', summary: 'Long enough summary', status: 'live', url: 'javascript:alert(1)' }, projectSchema));
  const ok = validate({ name: 'X Co', slug: 'x-co', summary: 'Long enough summary', status: 'live', tech: 'HTML, CSS' }, projectSchema);
  assert.deepEqual(ok.tech, ['HTML', 'CSS']);
  assert.equal(validate({ name: 'X Co', slug: 'x-co', summary: 'Long enough summary', status: 'live', image_url: '/media/projects/123e4567-e89b-12d3-a456-426614174000.jpg' }, projectSchema).image_url, '/media/projects/123e4567-e89b-12d3-a456-426614174000.jpg');
});

test('isEmail', () => {
  assert.ok(isEmail('neuropulse.inc@gmail.com'));
  assert.ok(!isEmail('no-at-sign.com'));
  assert.ok(!isEmail('a@b'));
});
