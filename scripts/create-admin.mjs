#!/usr/bin/env node
/**
 * Create or reset an admin account for the dashboard at /admin.
 *
 *   npm run admin:create -- --email neuropulse.inc@gmail.com --name "Karabo"            (local D1)
 *   npm run admin:create -- --email neuropulse.inc@gmail.com --name "Karabo" --remote   (production D1)
 *
 * You are asked for the password (hidden). For scripts/CI, set ADMIN_PASSWORD instead.
 * The password is hashed here with the same PBKDF2 code the Worker uses; only the hash is stored.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/server/lib/crypto.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const remote = args.includes('--remote');
const email = (flag('email') || '').trim().toLowerCase();
const name = (flag('name') || 'Admin').trim();

if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
  console.error('Usage: npm run admin:create -- --email you@example.com --name "Your Name" [--remote]');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  if (!process.stdin.isTTY) {
    console.error('No terminal available. Set ADMIN_PASSWORD in the environment instead.');
    process.exit(1);
  }
  password = await askHidden('Password (min 10 characters): ');
  const again = await askHidden('Repeat password: ');
  if (password !== again) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}
if (password.length < 10) {
  console.error('Use at least 10 characters. A short sentence works well.');
  process.exit(1);
}

const hash = await hashPassword(password);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql =
  `INSERT INTO admins (email, name, password_hash) VALUES (${q(email)}, ${q(name)}, ${q(hash)}) ` +
  `ON CONFLICT (email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash;`;

// The SQL goes into a temporary file and is passed with --file. Passing it with --command
// breaks on Windows, where the shell splits the statement at every space.
const tmpDir = join(root, '.wrangler', 'tmp');
mkdirSync(tmpDir, { recursive: true });
const sqlFile = join(tmpDir, `create-admin-${Date.now()}.sql`);
writeFileSync(sqlFile, sql + '\n');

console.log(`Saving admin ${email} to the ${remote ? 'REMOTE (production)' : 'local'} database...`);
const isWin = process.platform === 'win32';
const relFile = relative(root, sqlFile).split('\\').join('/'); // no spaces, safe for any shell
try {
  execFileSync(
    isWin ? 'npx.cmd' : 'npx',
    ['wrangler', 'd1', 'execute', 'neuropulse-db', remote ? '--remote' : '--local', '--yes', '--file', relFile],
    { cwd: root, stdio: 'inherit', shell: isWin },
  );
} finally {
  rmSync(sqlFile, { force: true }); // the file contains the password hash, so never leave it behind
}
console.log(`Done. Sign in at ${remote ? 'your-site' : 'http://localhost:8787'}/admin`);
