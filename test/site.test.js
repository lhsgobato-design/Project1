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
  const config = {
    ...loadConfig({}),
    contactEmail: 'hello@example.test',
    controllerName: 'Test Founder SL',
    controllerAddress: 'Carrer de Prova 1, Barcelona',
    controllerTaxId: 'B00000000',
    retention: 'Twelve months after your last message',
  };
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
    assert.match(html, /What project1 helps you understand/);
    for (const topic of ['How grading works\\.', 'How classes are run\\.', 'How your schedule works\\.']) assert.match(html, new RegExp(topic));
    assert.match(html, /understand how grading, classes and schedules work/);
    assert.match(html, /without putting their grades at risk, because project1 is your number one friend\./);
    assert.match(html, /<h2 class="h2">Tell us your doubt\.<\/h2>/);
    assert.match(html, /Join the waiting list and tell us your doubt\./);
    assert.doesNotMatch(html, /tell us what is hardest/i);
    assert.match(html, /Three steps/);
    assert.match(html, /When project1 is ready for the first students, we invite you to try it\./);
    assert.match(html, /Why we are doing this/);
    assert.match(html, /Who it is for/);
    assert.equal((html.match(/<details>/g) || []).length, 6, 'six questions');
    for (const field of ['name="name"', 'name="email"', 'name="answer"', 'name="consent"']) assert.ok(html.includes(field), field);
    assert.match(html, /What is your biggest doubt about studying in Spain\?/);
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

describe('privacy information (GDPR Article 13 and Spanish LOPDGDD)', () => {
  it('names who is responsible, the basis, recipients, transfers, retention, rights and the complaint route', async () => {
    const html = await (await get('/privacy')).text();
    for (const text of [
      'Who is responsible', 'Test Founder SL', 'Carrer de Prova 1, Barcelona', 'Tax ID: B00000000',
      'Why we use it, and on what basis', 'take back your agreement',
      'Do you have to give it\\?', 'You must be 14 or older',
      'Railway', 'Resend', 'Moving details outside the EU', 'standard contractual clauses',
      'How long we keep it', 'Twelve months after your last message',
      'Your rights', 'delete them', 'limit how we use them', 'give them to you in a file',
      'Agencia Española de Protección de Datos', 'www\\.aepd\\.es',
      'We do not use cookies or tracking tools',
    ]) assert.match(html, new RegExp(text), text);
  });

  it('shows the short first layer next to the form, with a link to the full page', async () => {
    const html = await (await get('/')).text();
    assert.match(html, /Data protection\.<\/strong> Responsible: Test Founder SL\. Purpose: to contact you about project1\. Basis: your consent\. You must be 14 or older\./);
    assert.match(html, /href="\/privacy">Read the full Privacy page\./);
  });

  it('shows honest placeholders until the details are set', async () => {
    const db2 = openDb(':memory:');
    const server2 = createApp({ db: db2, config: loadConfig({}) }).listen(0);
    await new Promise((resolve) => server2.once('listening', resolve));
    const html = await (await fetch(`http://127.0.0.1:${server2.address().port}/privacy`)).text();
    for (const placeholder of ['[name of the person or company responsible to be added]', '[address to be added]', '[how long we keep your details to be added]']) assert.ok(html.includes(placeholder), placeholder);
    assert.doesNotMatch(html, /Tax ID/);
    server2.close();
    db2.close();
  });

  it('loads nothing from other companies: fonts come from this website', async () => {
    for (const path of ['/', '/privacy', '/thank-you']) {
      const res = await get(path);
      const html = await res.text();
      assert.doesNotMatch(html, /https?:\/\/(?!www\.aepd\.es)/, `${path} has no outside address`);
      const csp = res.headers.get('content-security-policy');
      assert.match(csp, /style-src 'self';/);
      assert.match(csp, /font-src 'self';/);
      assert.doesNotMatch(csp, /google/);
      assert.equal(res.headers.get('set-cookie'), null, 'no cookies on public pages');
    }
    const css = await (await get('/assets/fonts.css')).text();
    assert.match(css, /font-family: "Bricolage Grotesque"/);
    const font = await get('/assets/fonts/dm-sans-latin-400-normal.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
  });
});

describe('logo', () => {
  it('shows the logo in the top bar and the footer, with the name project1 for screen readers', async () => {
    for (const path of ['/', '/privacy', '/thank-you']) {
      const html = await (await get(path)).text();
      assert.equal((html.match(/aria-label="project1"/g) || []).length, 2, `${path}: top bar and footer`);
      assert.match(html, /<a class="logo logo-light" href="\/" aria-label="project1"><span aria-hidden="true">project<\/span><svg class="turtle"/);
      assert.match(html, /rel="icon" href="\/assets\/favicon\.svg"/);
      assert.doesNotMatch(html, /style="/, 'no inline styles (the CSP forbids them)');
    }
  });

  it('serves the favicon and the touch icon', async () => {
    const svg = await get('/assets/favicon.svg');
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await svg.text(), /aria-label="project1"/);
    const png = await get('/assets/apple-touch-icon.png');
    assert.equal(png.status, 200);
    assert.equal(png.headers.get('content-type'), 'image/png');
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

describe('search engines', () => {
  it('are asked to skip the public pages until indexing is switched on', async () => {
    assert.match((await get('/')).headers.get('x-robots-tag'), /noindex/);
    const db2 = openDb(':memory:');
    const server2 = createApp({ db: db2, config: { ...loadConfig({}), allowIndexing: true } }).listen(0);
    await new Promise((resolve) => server2.once('listening', resolve));
    const res = await fetch(`http://127.0.0.1:${server2.address().port}/`);
    assert.equal(res.headers.get('x-robots-tag'), null);
    server2.close();
    db2.close();
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
