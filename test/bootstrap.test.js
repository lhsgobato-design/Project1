import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bootstrapAdmin, createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';

async function loginStatus(db, config, password) {
  const server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: config.adminEmail, password }).toString(),
  });
  server.close();
  return res.status;
}

describe('first start and password reset', () => {
  const base = { ...loadConfig({}), adminEmail: 'admin@example.test', adminPassword: 'first password here' };

  it('creates the admin once, and leaves it alone on later starts', async () => {
    const db = openDb(':memory:');
    assert.equal(await bootstrapAdmin(db, base), 'created');
    assert.equal(await bootstrapAdmin(db, { ...base, adminPassword: 'a different password' }), false);
    assert.equal(await loginStatus(db, base, 'first password here'), 303);
    assert.equal(await loginStatus(db, base, 'a different password'), 401);
    db.close();
  });

  it('replaces the admin when ADMIN_RESET is true', async () => {
    const db = openDb(':memory:');
    await bootstrapAdmin(db, base);
    const reset = { ...base, adminPassword: 'brand new password', adminReset: true };
    assert.equal(await bootstrapAdmin(db, reset), 'reset');
    assert.equal(await loginStatus(db, reset, 'brand new password'), 303);
    assert.equal(await loginStatus(db, reset, 'first password here'), 401);
    db.close();
  });

  it('does nothing on reset without both values', async () => {
    const db = openDb(':memory:');
    await bootstrapAdmin(db, base);
    assert.equal(await bootstrapAdmin(db, { ...base, adminPassword: '', adminReset: true }), false);
    assert.equal(await loginStatus(db, base, 'first password here'), 303);
    db.close();
  });
});
