import { createApp, bootstrapAdmin } from './app.js';
import { loadConfig } from './config.js';
import { openDb, openReadOnlyDb } from './db.js';
import { createAcceptanceMailer, createNotifier, notifierMode } from './notify.js';

const config = loadConfig();
const db = openDb(config.databasePath);

const adminResult = await bootstrapAdmin(db, config);
if (adminResult === 'created') console.log('Admin created from ADMIN_EMAIL and ADMIN_PASSWORD.');
if (adminResult === 'reset') console.log('Admin replaced from ADMIN_EMAIL and ADMIN_PASSWORD. Remove ADMIN_RESET now.');

if (config.production && !config.contactEmail) {
  console.warn('CONTACT_EMAIL is not set: the footer and Privacy page show a placeholder where people ask for deletion.');
}

const notifier = createNotifier({
  to: config.notifyEmail, from: config.mailFrom, smtpUrl: config.smtpUrl, resendApiKey: config.resendApiKey, publicUrl: config.publicUrl,
});
console.log(
  notifier
    ? `Email on each new enquiry: on (${notifierMode(config)}).`
    : 'Email on each new enquiry: off (set NOTIFY_EMAIL and RESEND_API_KEY, or SMTP_URL).',
);

// Second, read-only connection for the agent API (SQLite refuses writes on it).
const readDb = config.databasePath === ':memory:' ? null : openReadOnlyDb(config.databasePath);
console.log(
  readDb && config.agentReadTokenHash
    ? 'Agent API (read-only): on.'
    : 'Agent API (read-only): off (set AGENT_READ_TOKEN_SHA256).',
);

const acceptanceMailer = createAcceptanceMailer({
  from: config.mailFrom, replyTo: config.contactEmail || config.notifyEmail, smtpUrl: config.smtpUrl, resendApiKey: config.resendApiKey,
});
console.log(acceptanceMailer.enabled ? `Acceptance email to students: on (from ${config.mailFrom}).` : `Acceptance email to students: off. ${acceptanceMailer.reason}`);

const app = createApp({ db, readDb, config, notifier, acceptanceMailer });
const server = app.listen(config.port, () => {
  console.log(`project1 admin listening on port ${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { readDb?.close(); db.close(); process.exit(0); }));
}
