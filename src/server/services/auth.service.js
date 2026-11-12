/**
 * Admin sign-in / sign-out business logic, including optional two-factor codes.
 */
import { HttpError } from '../lib/http.js';
import { randomToken, sha256Hex, verifyPassword } from '../lib/crypto.js';
import { verifyTotp } from '../lib/totp.js';
import { audit, createSession, deleteSession, findAdminByEmail } from '../repositories/admins.repo.js';
import { SESSION_DAYS } from '../middleware/auth.js';

// A real hash to compare against when the email is unknown, so response time
// does not reveal which emails have accounts.
const DUMMY_HASH = 'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * @param {string | null} [code] 6-digit authenticator code. Only needed when the admin has turned on 2FA.
 *   The password is always checked first, so the form only reveals "2FA is on" to someone who knows it.
 */
export async function login(db, email, password, code = null) {
  const admin = await findAdminByEmail(db, email);
  const ok = await verifyPassword(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok) throw new HttpError(401, 'That email and password do not match.');

  if (admin.totp_enabled && admin.totp_secret) {
    if (!code) throw new HttpError(401, 'Enter the 6-digit code from your authenticator app.', { code: 'Enter the 6-digit code from your authenticator app.' });
    if (!(await verifyTotp(admin.totp_secret, code))) {
      await audit(db, admin.id, 'admin.login_code_failed');
      throw new HttpError(401, 'That code is not right. Wait for a new one and try again.', { code: 'That code is not right. Wait for a new one and try again.' });
    }
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await createSession(db, await sha256Hex(token), admin.id, expiresAt);
  await audit(db, admin.id, 'admin.login');
  return { token, admin: { id: admin.id, name: admin.name, email: admin.email }, maxAge: SESSION_DAYS * 86_400 };
}

export async function logout(db, token) {
  if (token) await deleteSession(db, await sha256Hex(token));
}
