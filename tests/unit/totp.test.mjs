import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpAt, verifyTotp } from '../../src/server/lib/totp.js';

// RFC 6238 appendix B test secret: the ASCII text "12345678901234567890".
const SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

test('base32 round trip and rejects junk', () => {
  assert.equal(SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual([...base32Decode(SECRET)], [...new TextEncoder().encode('12345678901234567890')]);
  assert.throws(() => base32Decode('not*base32'));
});

test('matches the RFC 6238 test vectors (8 digits)', async () => {
  const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [seconds, code] of vectors) assert.equal(await totpAt(SECRET, seconds * 1000, { digits: 8 }), code, `T=${seconds}`);
});

test('6-digit codes are the last six digits of the 8-digit ones', async () => {
  assert.equal(await totpAt(SECRET, 59_000), '287082');
  assert.equal(await totpAt(SECRET, 1111111109_000), '081804');
});

test('verifyTotp accepts the current and neighbouring codes, nothing else', async () => {
  assert.equal(await verifyTotp(SECRET, '287082', 59_000), true);
  assert.equal(await verifyTotp(SECRET, '287 082', 59_000), true, 'spaces are ignored');
  assert.equal(await verifyTotp(SECRET, '287082', 59_000 + 30_000), true, 'previous step still accepted');
  assert.equal(await verifyTotp(SECRET, '287082', 59_000 + 90_000), false, 'three steps later is rejected');
  assert.equal(await verifyTotp(SECRET, '000000', 59_000), false);
  assert.equal(await verifyTotp(SECRET, '28708', 59_000), false);
  assert.equal(await verifyTotp(SECRET, 'abcdef', 59_000), false);
  assert.equal(await verifyTotp(SECRET, null, 59_000), false);
});

test('generated secrets are valid, random and the right size', () => {
  const a = generateTotpSecret();
  const b = generateTotpSecret();
  assert.match(a, /^[A-Z2-7]{32}$/);
  assert.notEqual(a, b);
  assert.equal(base32Decode(a).length, 20);
});

test('otpauth link carries the secret and issuer', () => {
  const uri = otpauthUri({ secret: 'ABC234', account: 'me@example.com', issuer: 'Neuropulse Admin' });
  assert.ok(uri.startsWith('otpauth://totp/Neuropulse%20Admin%3Ame%40example.com?secret=ABC234'));
  assert.ok(uri.includes('issuer=Neuropulse%20Admin'));
});
