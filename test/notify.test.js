import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import nodemailer from 'nodemailer';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createNotifier } from '../src/notify.js';

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createNotifier', () => {
  it('stays off without a recipient or an SMTP account', () => {
    assert.equal(createNotifier({ to: '', smtpUrl: 'smtp://x' }), null);
    assert.equal(createNotifier({ to: 'a@example.test', smtpUrl: '' }), null);
  });

  it('writes a short email that can be answered directly, with a link to the enquiry', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const notify = createNotifier({ to: 'owner@example.test', from: 'site@example.test', publicUrl: 'https://site.example.test/', transport });
    const sent = [];
    const original = transport.sendMail.bind(transport);
    transport.sendMail = async (message) => { sent.push(await original(message)); return sent.at(-1); };
    await notify({ id: 7, name: 'Ana Student', email: 'ana@example.test', answer: 'Exams' });
    const mail = JSON.parse(sent[0].message);
    assert.equal(mail.subject, 'New enquiry: Ana Student');
    assert.equal(mail.from.address, 'site@example.test');
    assert.equal(mail.to[0].address, 'owner@example.test');
    assert.equal(mail.replyTo[0].address, 'ana@example.test');
    assert.match(mail.text, /Answer: Exams/);
    assert.match(mail.text, /https:\/\/site\.example\.test\/admin\/enquiries\/7/);
  });

  it('cannot be used to inject email headers through the name', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const notify = createNotifier({ to: 'owner@example.test', transport });
    const sent = [];
    const original = transport.sendMail.bind(transport);
    transport.sendMail = async (message) => { sent.push(await original(message)); return sent.at(-1); };
    await notify({ id: 1, name: 'Eve\r\nBcc: attacker@example.test', email: 'eve@example.test', answer: '' });
    const mail = JSON.parse(sent[0].message);
    assert.doesNotMatch(mail.subject, /[\r\n]/);
    assert.equal(mail.bcc, undefined);
    assert.match(mail.text, /\(no answer given\)/);
  });
});

describe('email on each new enquiry', () => {
  async function start(notifier) {
    const db = openDb(':memory:');
    const server = createApp({ db, config: loadConfig({}), notifier }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const join = (body) => fetch(`${base}/join`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(),
    });
    const api = (body) => fetch(`${base}/api/enquiries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { db, server, join, api };
  }

  const form = { name: 'Ana', email: 'ana@example.test', answer: 'Exams', consent: 'on' };

  it('sends one email for a new enquiry, from the form and from the API', async () => {
    const calls = [];
    const { db, server, join, api } = await start(async (e) => { calls.push(e); });
    assert.equal((await join(form)).status, 303);
    assert.equal((await api({ ...form, email: 'bo@example.test', consent: true })).status, 201);
    await wait();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { id: 1, name: 'Ana', email: 'ana@example.test', answer: 'Exams' });
    server.close(); db.close();
  });

  it('does not send again for the same email, or for a form that was refused', async () => {
    const calls = [];
    const { db, server, join } = await start(async (e) => { calls.push(e); });
    await join(form);
    await join({ ...form, email: 'ANA@example.test' });
    await join({ name: '', email: 'bad' });
    await join({ ...form, email: 'bot@example.test', website: 'spam' });
    await wait();
    assert.equal(calls.length, 1);
    server.close(); db.close();
  });

  it('still saves the enquiry and thanks the visitor when the email fails', async () => {
    const { db, server, join } = await start(async () => { throw Object.assign(new Error('smtp down'), { code: 'ECONNECTION' }); });
    const res = await join(form);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/thank-you');
    await wait();
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n), 1);
    server.close(); db.close();
  });
});
