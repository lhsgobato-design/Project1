import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { bootstrapAdmin, createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { makeRepo, openDb, openReadOnlyDb } from '../src/db.js';
import { sha256 } from '../src/security.js';

const KEY = 'agent-test-key-0123456789abcdef';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-agent-'));
const file = path.join(dir, 'test.db');

let db;
let readDb;
let server;
let base;

const get = (p, key = KEY) => fetch(base + p, { headers: key ? { Authorization: `Bearer ${key}` } : {} });

before(async () => {
  db = openDb(file);
  readDb = openReadOnlyDb(file);
  const config = {
    ...loadConfig({}),
    adminEmail: 'admin@example.test',
    adminPassword: 'a long test password',
    agentReadTokenHash: sha256(KEY),
  };
  await bootstrapAdmin(db, config);
  const repo = makeRepo(db);
  const { id } = repo.createEnquiry({ name: 'Ana', email: 'ana@example.test', answer: 'Exams' });
  repo.addNote(id, 'Wrote back on Monday.');
  repo.createEnquiry({ name: 'Ben', email: 'ben@example.test', answer: '' });
  repo.setStatus(id, 'Contacted');
  server = createApp({ db, readDb, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  readDb.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('agent API: access', () => {
  it('refuses a request without a key', async () => {
    const res = await get('/api/agent/summary', '');
    assert.equal(res.status, 401);
  });

  it('refuses a wrong key', async () => {
    const res = await get('/api/agent/summary', 'wrong-key');
    assert.equal(res.status, 401);
  });

  it('refuses the admin password used as a key', async () => {
    const res = await get('/api/agent/summary', 'a long test password');
    assert.equal(res.status, 401);
  });

  it('has no write routes', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base}/api/agent/enquiries/1`, { method, headers: { Authorization: `Bearer ${KEY}` } });
      assert.equal(res.status, 404, method);
    }
  });

  it('is off (404) when no key hash is configured', async () => {
    const off = createApp({ db, readDb, config: { ...loadConfig({}) } }).listen(0);
    await new Promise((resolve) => off.once('listening', resolve));
    const res = await fetch(`http://127.0.0.1:${off.address().port}/api/agent/summary`, { headers: { Authorization: `Bearer ${KEY}` } });
    off.close();
    assert.equal(res.status, 404);
  });
});

describe('agent API: data', () => {
  it('returns counts and the latest enquiries', async () => {
    const res = await get('/api/agent/summary');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.equal(body.counts.total, 2);
    assert.equal(body.counts.byStatus.Contacted, 1);
    assert.equal(body.latest.length, 2);
  });

  it('filters by status and never shows admin data', async () => {
    const body = await (await get('/api/agent/enquiries?status=Contacted')).json();
    assert.equal(body.enquiries.length, 1);
    assert.equal(body.enquiries[0].name, 'Ana');
    assert.equal(body.enquiries[0].note_count, 1);
    const text = JSON.stringify(body);
    assert.ok(!text.includes('password') && !text.includes('scrypt'));
  });

  it('rejects a bad status, date or limit', async () => {
    assert.equal((await get('/api/agent/enquiries?status=Nope')).status, 422);
    assert.equal((await get('/api/agent/enquiries?since=yesterday')).status, 422);
    assert.equal((await get('/api/agent/enquiries?limit=0')).status, 422);
  });

  it('returns one enquiry with its notes', async () => {
    const list = await (await get('/api/agent/enquiries?status=Contacted')).json();
    const body = await (await get(`/api/agent/enquiries/${list.enquiries[0].id}`)).json();
    assert.equal(body.enquiry.email, 'ana@example.test');
    assert.equal(body.notes[0].body, 'Wrote back on Monday.');
    assert.equal((await get('/api/agent/enquiries/9999')).status, 404);
  });
});

describe('read-only connection', () => {
  it('refuses every write', () => {
    assert.throws(() => readDb.exec("UPDATE enquiries SET status = 'Lost'"));
    assert.throws(() => readDb.exec('DELETE FROM enquiries'));
  });
});
