import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, referenceCode, safeEqual, verifyPassword } from '../../src/server/lib/crypto.js';
import { csvCell } from '../../src/server/lib/http.js';
import { Router } from '../../src/server/router.js';

test('password hash verifies only the right password', async () => {
  const h = await hashPassword('correct horse battery', 20_000);
  assert.match(h, /^pbkdf2\$sha256\$20000\$/);
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('reference codes avoid confusing characters', () => {
  for (let i = 0; i < 200; i++) assert.match(referenceCode(), /^NP-[A-HJ-NP-Z2-9]{6}$/);
});

test('safeEqual', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
});

test('CSV cells escape quotes and defuse formulas', () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(null), '');
});

test('router matches params, 404 and 405', () => {
  const r = new Router();
  r.get('/api/items/:id', () => 'get').delete('/api/items/:id', () => 'del');
  const m = r.match('GET', '/api/items/42');
  assert.equal(m.params.id, '42');
  assert.equal(r.match('DELETE', '/api/items/42').handler(), 'del');
  assert.throws(() => r.match('POST', '/api/items/42'), (e) => e.status === 405);
  assert.throws(() => r.match('GET', '/api/other'), (e) => e.status === 404);
});
