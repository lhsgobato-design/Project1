import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootstrapAdmin, createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { makeRepo, openDb } from '../src/db.js';
import { ACCEPTANCE_SUBJECT, createAcceptanceMailer } from '../src/notify.js';

const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'a long test password';

// A fake mail transport: records messages instead of sending them. failNext makes one send fail.
const sent = [];
let failNext = false;
const transport = {
  async sendMail(message) {
    if (failNext) {
      failNext = false;
      throw Object.assign(new Error('boom'), { code: 'TEST_FAIL' });
    }
    sent.push(message);
  },
};

let db;
let repo;
let base;
let server;
let offBase;
let offServer;
let cookie = '';
let csrf = '';
let offCookie = '';

const post = (url, body, c = cookie) =>
  fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(c ? { Cookie: c } : {}) },
    body: new URLSearchParams(body).toString(),
  });
const page = async (url, c = cookie) => (await fetch(url, { redirect: 'manual', headers: { Cookie: c } })).text();

async function logIn(root) {
  const res = await post(`${root}/admin/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, '');
  return res.headers.get('set-cookie').split(';')[0];
}
const csrfOf = (html) => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';

let pilotId;
let leadId;

before(async () => {
  const config = { ...loadConfig({}), adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, contactEmail: 'hello@project1.example' };
  db = openDb(':memory:');
  await bootstrapAdmin(db, config);
  repo = makeRepo(db);
  pilotId = repo.createEnquiry({ name: 'Ana Pilot', email: 'ana@example.test', answer: 'Exams' }).id;
  leadId = repo.createEnquiry({ name: 'Ben Lead', email: 'ben@example.test', answer: '' }).id;
  repo.setStatus(pilotId, 'Pilot');

  const mailer = createAcceptanceMailer({ from: 'project1 <hello@project1.example>', replyTo: 'hello@project1.example', transport });
  server = createApp({ db, config, acceptanceMailer: mailer }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  cookie = await logIn(base);
  csrf = csrfOf(await page(`${base}/admin/enquiries`));

  // A second app on the same database with sending switched off (no MAIL_FROM).
  const off = createAcceptanceMailer({ from: '', transport });
  offServer = createApp({ db, config, acceptanceMailer: off }).listen(0);
  await new Promise((resolve) => offServer.once('listening', resolve));
  offBase = `http://127.0.0.1:${offServer.address().port}`;
  offCookie = await logIn(offBase);
});

after(() => {
  server.close();
  offServer.close();
  db.close();
});

describe('acceptance email: sending', () => {
  it('shows the button and the exact email on a Pilot enquiry', async () => {
    const html = await page(`${base}/admin/enquiries/${pilotId}`);
    assert.match(html, /<h2 class="h3">Acceptance email<\/h2>/);
    assert.match(html, /action="\/admin\/enquiries\/\d+\/accept-email"/);
    assert.match(html, /Send acceptance email/);
    assert.ok(html.includes(ACCEPTANCE_SUBJECT.replace("'", '&#39;')));
    assert.match(html, /Hi Ana Pilot,/);
  });

  it('does not offer it before the enquiry is in Pilot, and refuses a direct try', async () => {
    const html = await page(`${base}/admin/enquiries/${leadId}`);
    assert.doesNotMatch(html, /Send acceptance email<\/button>/);
    assert.match(html, /Set the status to/);
    const res = await post(`${base}/admin/enquiries/${leadId}/accept-email`, { _csrf: csrf });
    assert.equal(res.headers.get('location'), `/admin/enquiries/${leadId}?msg=accept-not-pilot`);
    assert.equal(sent.length, 0);
  });

  it('needs the CSRF token and a login', async () => {
    assert.equal((await post(`${base}/admin/enquiries/${pilotId}/accept-email`, { _csrf: 'wrong' })).status, 403);
    assert.equal((await post(`${base}/admin/enquiries/${pilotId}/accept-email`, { _csrf: csrf }, '')).headers.get('location'), '/admin');
    assert.equal(sent.length, 0);
  });

  it('keeps nothing when sending fails, so it can be tried again', async () => {
    failNext = true;
    const res = await post(`${base}/admin/enquiries/${pilotId}/accept-email`, { _csrf: csrf });
    assert.equal(res.headers.get('location'), `/admin/enquiries/${pilotId}?msg=accept-failed`);
    assert.equal(repo.get(pilotId).enquiry.accepted_email_at, null);
    assert.match(await page(`${base}/admin/enquiries/${pilotId}?msg=accept-failed`), /could not be sent/);
  });

  it('sends one email to the student, records it, and adds a note', async () => {
    const res = await post(`${base}/admin/enquiries/${pilotId}/accept-email`, { _csrf: csrf });
    assert.equal(res.headers.get('location'), `/admin/enquiries/${pilotId}?msg=accepted`);
    assert.equal(sent.length, 1);
    const [mail] = sent;
    assert.equal(mail.to, 'ana@example.test');
    assert.equal(mail.from, 'project1 <hello@project1.example>');
    assert.equal(mail.replyTo.address, 'hello@project1.example');
    assert.equal(mail.subject, ACCEPTANCE_SUBJECT);
    assert.match(mail.text, /^Hi Ana Pilot,/);
    assert.match(mail.text, /invited to try project1/);
    const found = repo.get(pilotId);
    assert.ok(found.enquiry.accepted_email_at);
    assert.ok(found.notes.some((n) => n.body === 'Acceptance email sent.'));
    const html = await page(`${base}/admin/enquiries/${pilotId}?msg=accepted`);
    assert.match(html, /Acceptance email sent\./);
    assert.match(html, /Sent on .* to <span class="break">ana@example\.test<\/span>/);
    assert.doesNotMatch(html, /Send acceptance email<\/button>/);
  });

  it('never sends it twice', async () => {
    const res = await post(`${base}/admin/enquiries/${pilotId}/accept-email`, { _csrf: csrf });
    assert.equal(res.headers.get('location'), `/admin/enquiries/${pilotId}?msg=accept-already`);
    assert.equal(sent.length, 1);
  });
});

describe('acceptance email: switched off', () => {
  it('explains why on the page and sends nothing', async () => {
    const id = repo.createEnquiry({ name: 'Cleo Pilot', email: 'cleo@example.test', answer: '' }).id;
    repo.setStatus(id, 'Pilot');
    const html = await page(`${offBase}/admin/enquiries/${id}`, offCookie);
    assert.match(html, /MAIL_FROM/);
    assert.doesNotMatch(html, /Send acceptance email<\/button>/);
    const res = await post(`${offBase}/admin/enquiries/${id}/accept-email`, { _csrf: csrfOf(html) }, offCookie);
    assert.equal(res.headers.get('location'), `/admin/enquiries/${id}?msg=accept-off`);
    assert.equal(sent.length, 1, 'still only the one email from before');
  });

  it('is off with Resend\'s shared sender, which can only write to the account owner', () => {
    const m = createAcceptanceMailer({ from: 'project1 <onboarding@resend.dev>', resendApiKey: 're_test' });
    assert.equal(m.enabled, false);
    assert.match(m.reason, /MAIL_FROM/);
    assert.equal(createAcceptanceMailer({ from: 'x <hello@project1.example>' }).enabled, false, 'no way to send');
  });
});

describe('acceptance email: database', () => {
  it('adds the new column to a database made before it existed', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-old-'));
    const file = path.join(dir, 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
      email_key TEXT NOT NULL UNIQUE, answer TEXT NOT NULL DEFAULT '', consent_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Lead', created_at TEXT NOT NULL);
      INSERT INTO enquiries (name, email, email_key, consent_at, created_at) VALUES ('Old', 'old@example.test', 'old@example.test', '2026-01-01', '2026-01-01');`);
    old.close();
    const upgraded = openDb(file);
    const cols = upgraded.prepare('PRAGMA table_info(enquiries)').all().map((c) => c.name);
    assert.ok(cols.includes('accepted_email_at'));
    assert.equal(makeRepo(upgraded).get(1).enquiry.name, 'Old', 'existing enquiries are kept');
    upgraded.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
