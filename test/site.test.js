import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';

let server;
let base;
let db;

const count = () => Number(db.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n);
const get = (path) => fetch(base + path, { redirect: 'manual' });
const join = (body) =>
  fetch(`${base}/join`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

before(async () => {
  const config = { ...loadConfig({}), contactEmail: 'hello@example.test' };
  db = openDb(':memory:');
  server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

describe('public pages', () => {
  it('Home shows the draft Copy page text and the form', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /New to the Spanish university system\?/);
    for (const q of ['How does grading work?', 'What if I fail?', 'How do I enrol?', 'How do I study here?']) assert.match(html, new RegExp(q.replace('?', '\\?')));
    assert.match(html, /<h2 class="h2">Nobody explains how it works\.<\/h2>/);
    assert.match(html, /Three steps/);
    assert.match(html, /Why we are doing this/);
    assert.match(html, /Who it is for/);
    assert.equal((html.match(/<details>/g) || []).length, 6, 'six questions');
    for (const field of ['name="name"', 'name="email"', 'name="answer"', 'name="consent"']) assert.ok(html.includes(field), field);
    assert.match(html, /What is the hardest part of studying in Spain for you\?/);
    assert.match(html, /I agree to be contacted by project1/);
    assert.match(html, /mailto:hello@example\.test/);
    assert.doesNotMatch(html, /\[Name\]|\[Answer\]|Lorem/, 'no placeholder text');
  });

  it('never links to the admin side', async () => {
    for (const path of ['/', '/thank-you', '/privacy']) {
      const html = await (await get(path)).text();
      assert.doesNotMatch(html, /\/admin/, path);
    }
  });

  it('serves Thank you, Privacy and Not found', async () => {
    const thanks = await get('/thank-you');
    assert.equal(thanks.status, 200);
    assert.match(await thanks.text(), /You're on the list\./);
    const privacy = await (await get('/privacy')).text();
    assert.match(privacy, /What we collect/);
    assert.match(privacy, /How to ask for deletion/);
    assert.match(privacy, /hello@example\.test/);
    const missing = await get('/no-such-page');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /This page does not exist\./);
    const api = await get('/api/nothing');
    assert.equal(api.status, 404);
    assert.equal((await api.json()).ok, false);
  });

  it('serves the shared token stylesheet and the site stylesheet', async () => {
    const tokens = await get('/assets/tokens.css');
    assert.equal(tokens.status, 200);
    assert.match(await tokens.text(), /--main: #4B3FD6/);
    assert.equal((await get('/assets/site.css')).status, 200);
  });
});

describe('the form on Home', () => {
  it('shows the Copy page messages next to the fields and keeps what was typed', async () => {
    const res = await join({ name: 'Ana', email: 'nope', answer: 'Exams', website: '' });
    assert.equal(res.status, 422);
    const html = await res.text();
    assert.match(html, /Please check your email address\./);
    assert.match(html, /Please tick the box so we can write to you\./);
    assert.doesNotMatch(html, /Please tell us your name\./);
    assert.match(html, /id="email"[^>]*aria-invalid="true"[^>]*autofocus/, 'focus moves to the first field to fix');
    assert.match(html, /value="Ana"/);
    assert.match(html, /value="nope"/);
    assert.match(html, />Exams<\/textarea>/);
    assert.equal(count(), 0, 'nothing saved');
  });

  it('escapes what was typed when it shows the form again', async () => {
    const html = await (await join({ name: '"><script>alert(1)</script>', email: 'x' })).text();
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert\(1\)/);
  });

  it('saves one enquiry as Lead and goes to the Thank you page', async () => {
    const res = await join({ name: 'Ana Student', email: 'ana@example.test', answer: 'Exams', consent: 'on', website: '' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/thank-you');
    const row = db.prepare('SELECT name, email, answer, status FROM enquiries').get();
    assert.deepEqual({ ...row }, { name: 'Ana Student', email: 'ana@example.test', answer: 'Exams', status: 'Lead' });
  });

  it('keeps one enquiry when the same email is sent twice', async () => {
    const res = await join({ name: 'Ana Again', email: 'ANA@example.test', consent: 'on' });
    assert.equal(res.status, 303);
    assert.equal(count(), 1);
  });

  it('ignores a form filled in by a bot, without saying so', async () => {
    const res = await join({ name: 'Bot', email: 'bot@example.test', consent: 'on', website: 'http://spam.test' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/thank-you');
    assert.equal(count(), 1);
  });
});

describe('without a contact email', () => {
  it('shows an honest placeholder instead of a made-up address', async () => {
    const config = { ...loadConfig({}), contactEmail: '' };
    const db2 = openDb(':memory:');
    const server2 = createApp({ db: db2, config }).listen(0);
    await new Promise((resolve) => server2.once('listening', resolve));
    const html = await (await fetch(`http://127.0.0.1:${server2.address().port}/privacy`)).text();
    assert.match(html, /\[contact email to be added\]/);
    server2.close();
    db2.close();
  });
});
