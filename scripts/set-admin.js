// Creates or replaces the one admin. Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='at least 12 characters' npm run set-admin
import { loadConfig } from '../src/config.js';
import { makeRepo, openDb } from '../src/db.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../src/security.js';

const config = loadConfig();
if (!config.adminEmail || !config.adminPassword) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD first.');
  process.exit(1);
}
if (config.adminPassword.length < MIN_PASSWORD_LENGTH) {
  console.error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
const db = openDb(config.databasePath);
makeRepo(db).setAdmin(config.adminEmail, await hashPassword(config.adminPassword));
db.close();
console.log('Admin saved. Existing logins are signed out.');
