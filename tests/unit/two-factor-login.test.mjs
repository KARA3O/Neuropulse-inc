import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../../src/server/lib/crypto.js';
import { generateTotpSecret, totpAt } from '../../src/server/lib/totp.js';
import { login } from '../../src/server/services/auth.service.js';
import { HttpError } from '../../src/server/lib/http.js';

/** Just enough of the D1 API for the sign-in code path. */
function fakeDb(admin) {
  const log = [];
  const stmt = (sql) => ({
    bind: (...args) => ({
      first: async () => (sql.includes('FROM admins WHERE email') ? admin : null),
      run: async () => { log.push(sql.split(' ').slice(0, 3).join(' ')); return {}; },
      args,
      sql,
    }),
  });
  return { prepare: stmt, batch: async (stmts) => { log.push(`batch:${stmts.length}`); return []; }, log };
}

const PASSWORD = 'correct horse battery staple';
const base = { id: 1, email: 'a@example.com', name: 'Admin' };

test('without two-factor, a correct password signs in', async () => {
  const db = fakeDb({ ...base, password_hash: await hashPassword(PASSWORD), totp_secret: null, totp_enabled: 0 });
  const out = await login(db, base.email, PASSWORD, null);
  assert.equal(out.admin.email, base.email);
  assert.ok(out.token.length > 20);
});

test('with two-factor on, the password alone is not enough', async () => {
  const secret = generateTotpSecret();
  const db = fakeDb({ ...base, password_hash: await hashPassword(PASSWORD), totp_secret: secret, totp_enabled: 1 });
  await assert.rejects(login(db, base.email, PASSWORD, null), (err) => err instanceof HttpError && err.status === 401 && !!err.fields?.code);
  await assert.rejects(login(db, base.email, PASSWORD, '000000'), (err) => err instanceof HttpError && err.status === 401 && /not right/.test(err.fields.code));
});

test('with two-factor on, the right password and current code sign in', async () => {
  const secret = generateTotpSecret();
  const db = fakeDb({ ...base, password_hash: await hashPassword(PASSWORD), totp_secret: secret, totp_enabled: 1 });
  const out = await login(db, base.email, PASSWORD, await totpAt(secret));
  assert.equal(out.admin.id, 1);
});

test('a wrong password never reveals whether two-factor is on', async () => {
  const secret = generateTotpSecret();
  const db = fakeDb({ ...base, password_hash: await hashPassword(PASSWORD), totp_secret: secret, totp_enabled: 1 });
  await assert.rejects(login(db, base.email, 'wrong password', null), (err) => err.status === 401 && !err.fields && /do not match/.test(err.message));
  await assert.rejects(login(fakeDb(null), 'nobody@example.com', 'x', null), (err) => err.status === 401 && !err.fields);
});
