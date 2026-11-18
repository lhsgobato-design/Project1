import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootstrapAdmin, createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';

const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'a long test password';

let server;
let base;
let db;
let cookie = '';
let csrf = '';

const post = (path, body, { json = false, withCookie = true, extra = {} } = {}) =>
  fetch(base + path, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded',
      ...(withCookie && cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });

const get = (path, { withCookie = true } = {}) =>
  fetch(base + path, { redirect: 'manual', headers: withCookie && cookie ? { Cookie: cookie } : {} });

const form = { name: 'Test Student', email: 'student@example.test', answer: 'Exams', consent: 'on' };
const api = (body) => post('/api/enquiries', body, { json: true, withCookie: false });

async function login(password = ADMIN_PASSWORD, email = ADMIN_EMAIL) {
  return post('/admin/login', { email, password }, { withCookie: false });
}

async function refreshCsrf() {
  const html = await (await get('/admin/enquiries')).text();
  csrf = /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
}

before(async () => {
  const config = { ...loadConfig({}), adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD };
  db = openDb(':memory:');
  await bootstrapAdmin(db, config);
  server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

describe('public enquiry endpoint', () => {
  it('rejects missing fields with the Copy page messages', async () => {
    const res = await api({});
    assert.equal(res.status, 422);
    const { errors } = await res.json();
    assert.equal(errors.name, 'Please tell us your name.');
    assert.equal(errors.email, 'Please check your email address.');
    assert.equal(errors.consent, 'Please tick the box so we can write to you.');
    assert.equal(errors.answer, undefined);
  });

  it('rejects a bad email and a missing consent separately', async () => {
    const res = await api({ ...form, email: 'not-an-email', consent: false });
    assert.equal(res.status, 422);
    const { errors } = await res.json();
    assert.deepEqual(Object.keys(errors).sort(), ['consent', 'email']);
  });

  it('accepts an enquiry without an answer', async () => {
    const res = await api({ name: 'No Answer', email: 'noanswer@example.test', consent: true });
    assert.equal(res.status, 201);
  });

  it('keeps one enquiry when the same email is sent twice', async () => {
    assert.equal((await api(form)).status, 201);
    assert.equal((await api({ ...form, email: 'STUDENT@example.test' })).status, 201);
    const count = db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE email_key = 'student@example.test'").get().n;
    assert.equal(Number(count), 1);
  });
});

describe('admin access', () => {
  it('shows only the login screen without a login, and asks search engines to skip it', async () => {
    const res = await get('/admin', { withCookie: false });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
    assert.match(await res.text(), /Log in/);
  });

  it('sends protected pages to the login screen', async () => {
    for (const path of ['/admin/enquiries', '/admin/enquiries.csv', '/admin/enquiries/1']) {
      const res = await get(path, { withCookie: false });
      assert.equal(res.status, 303, path);
      assert.equal(res.headers.get('location'), '/admin');
    }
    const blocked = await post('/admin/enquiries/1/delete', { _csrf: 'x' }, { withCookie: false });
    assert.equal(blocked.status, 303);
  });

  it('refuses a wrong password and an unknown email the same way', async () => {
    const wrongPassword = await login('wrong password here');
    const unknownEmail = await login(ADMIN_PASSWORD, 'someone@example.test');
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.match(await wrongPassword.text(), /Wrong email or password/);
    assert.match(await unknownEmail.text(), /Wrong email or password/);
  });

  it('logs in with a safe cookie', async () => {
    const res = await login();
    assert.equal(res.status, 303);
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\/admin/i);
    cookie = setCookie.split(';')[0];
    await refreshCsrf();
    assert.ok(csrf.length > 20);
  });
});

describe('admin list', () => {
  it('lists enquiries newest first with the count per status', async () => {
    const html = await (await get('/admin/enquiries')).text();
    assert.match(html, /Test Student/);
    assert.match(html, /No Answer/);
    // "Test Student" was sent after "No Answer", so it comes first.
    assert.ok(html.indexOf('Test Student') < html.indexOf('No Answer'), 'newest first');
    for (const status of ['Lead', 'Contacted', 'Call booked', 'Pilot', 'Customer', 'Lost']) assert.match(html, new RegExp(status));
    assert.match(html, /2 of 2 enquiries/);
  });

  it('searches by name and by email', async () => {
    const byName = await (await get('/admin/enquiries?q=Test%20Stud')).text();
    assert.match(byName, /Test Student/);
    assert.doesNotMatch(byName, /No Answer/);
    const byEmail = await (await get('/admin/enquiries?q=noanswer%40')).text();
    assert.match(byEmail, /No Answer/);
    assert.doesNotMatch(byEmail, /Test Student/);
    const none = await (await get('/admin/enquiries?q=%25')).text();
    assert.match(none, /No enquiries match/);
  });

  it('exports the list as CSV and blocks spreadsheet formulas', async () => {
    await api({ name: '=HYPERLINK("http://evil.test")', email: 'formula@example.test', consent: 'on' });
    const res = await get('/admin/enquiries.csv');
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="enquiries-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 byte-order mark, so Excel reads accents');
    const csv = new TextDecoder().decode(bytes);
    assert.ok(csv.startsWith('"Name","Email","Answer","Date","Status","Last note","Notes"'));
    assert.match(csv, /"Test Student","student@example.test","Exams"/);
    assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil.test""\)"/);
  });
});

describe('admin detail', () => {
  const id = () => Number(db.prepare("SELECT id FROM enquiries WHERE email_key = 'student@example.test'").get().id);

  it('shows the full answer, status and consent date', async () => {
    const html = await (await get(`/admin/enquiries/${id()}`)).text();
    assert.match(html, /Exams/);
    assert.match(html, /Agreed to be contacted/);
    assert.match(html, /What the statuses mean/);
  });

  it('changes the status and filters by it', async () => {
    const res = await post(`/admin/enquiries/${id()}/status`, { _csrf: csrf, status: 'Call booked' });
    assert.equal(res.status, 303);
    const list = await (await get('/admin/enquiries?status=Call%20booked')).text();
    assert.match(list, /Test Student/);
    assert.doesNotMatch(list, /No Answer/);
  });

  it('refuses a status that does not exist', async () => {
    const res = await post(`/admin/enquiries/${id()}/status`, { _csrf: csrf, status: 'Won' });
    assert.equal(res.status, 422);
    assert.equal(db.prepare('SELECT status FROM enquiries WHERE id = ?').get(id()).status, 'Call booked');
  });

  it('adds a dated note and shows it as the last note', async () => {
    const res = await post(`/admin/enquiries/${id()}/notes`, { _csrf: csrf, note: 'Wrote to them <b>today</b>.' });
    assert.equal(res.status, 303);
    const html = await (await get(`/admin/enquiries/${id()}`)).text();
    assert.match(html, /Wrote to them &lt;b&gt;today&lt;\/b&gt;\./);
    const list = await (await get('/admin/enquiries')).text();
    assert.match(list, /Wrote to them/);
  });

  it('refuses an empty note', async () => {
    const res = await post(`/admin/enquiries/${id()}/notes`, { _csrf: csrf, note: '   ' });
    assert.equal(res.status, 422);
  });

  it('refuses changes without the CSRF token', async () => {
    const res = await post(`/admin/enquiries/${id()}/status`, { status: 'Lost' });
    assert.equal(res.status, 403);
    const wrong = await post(`/admin/enquiries/${id()}/delete`, { _csrf: 'wrong' });
    assert.equal(wrong.status, 403);
    assert.ok(db.prepare('SELECT 1 FROM enquiries WHERE id = ?').get(id()));
  });

  it('returns 404 for an enquiry that does not exist', async () => {
    assert.equal((await get('/admin/enquiries/9999')).status, 404);
    assert.equal((await get('/admin/enquiries/abc')).status, 404);
  });

  it('deletes an enquiry with its notes, and from the export', async () => {
    const target = id();
    const res = await post(`/admin/enquiries/${target}/delete`, { _csrf: csrf });
    assert.equal(res.status, 303);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notes WHERE enquiry_id = ?').get(target).n, 0);
    const csv = await (await get('/admin/enquiries.csv')).text();
    assert.doesNotMatch(csv, /student@example.test/);
  });
});

describe('logout', () => {
  it('ends the session', async () => {
    await refreshCsrf();
    const res = await post('/admin/logout', { _csrf: csrf });
    assert.equal(res.status, 303);
    const after = await get('/admin/enquiries');
    assert.equal(after.status, 303);
  });
});

describe('login limit', () => {
  it('stops repeated wrong passwords', async () => {
    let last;
    for (let i = 0; i < 12; i += 1) last = await login('wrong password here');
    assert.equal(last.status, 429);
  });
});
