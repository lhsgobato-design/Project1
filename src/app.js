import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { STATUSES, makeAgentRepo, makeRepo } from './db.js';
import {
  MIN_PASSWORD_LENGTH, createLimiter, dummyHash, hashPassword, randomToken, safeEqual, sha256, verifyPassword,
} from './security.js';
import { validateEnquiry, validateNote } from './validate.js';
import { homePage, privacyPage, siteNotFoundPage, thankYouPage } from './site.js';
import { detailPage, enquiriesCsv, listPage, loginPage, notFoundPage } from './views.js';

const COOKIE = 'p1_admin';
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

// First start: create the one admin from ADMIN_EMAIL and ADMIN_PASSWORD, if there is none yet.
// With ADMIN_RESET=true the admin is replaced on start (a way to set a new password on a host
// without a terminal). Remove ADMIN_RESET afterwards: every restart would sign the admin out.
// Returns 'created', 'reset' or false.
export async function bootstrapAdmin(db, config) {
  const repo = makeRepo(db);
  const exists = repo.hasAdmin();
  if (exists && !config.adminReset) return false;
  if (!config.adminEmail || !config.adminPassword) return false;
  if (config.adminPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  repo.setAdmin(config.adminEmail, await hashPassword(config.adminPassword));
  return exists ? 'reset' : 'created';
}

// readDb: a read-only connection (openReadOnlyDb). The agent API only ever uses this one.
export function createApp({ db, readDb = null, config, notifier = null }) {
  const repo = makeRepo(db);
  const app = express();
  // Sends the email for a new enquiry. Never slows down or breaks the form.
  const saveEnquiry = (value) => {
    const { id, duplicate } = repo.createEnquiry(value);
    if (!duplicate && notifier) {
      notifier({ id, ...value })
        .then(() => console.log(`Email notification sent for enquiry ${id}.`))
        .catch((error) => console.error('Email notification failed:', error.code || error.message));
    }
  };
  const loginLimiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  const enquiryLimiter = createLimiter({ max: 20, windowMs: 60 * 60 * 1000 });

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // ---------- Public website ----------
  const site = express.Router();
  const contact = config.contactEmail;
  const legal = {
    name: config.controllerName,
    address: config.controllerAddress,
    taxId: config.controllerTaxId,
    retention: config.retention,
  };

  site.use((req, res, next) => {
    // The copy is still a draft: ask search engines to skip the site until ALLOW_INDEXING=true.
    if (!config.allowIndexing) res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set({
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });
  site.use('/assets', express.static(publicDir, { maxAge: '1h' }));
  site.get('/', (req, res) => res.send(homePage({ contact, legal })));
  site.get('/thank-you', (req, res) => res.send(thankYouPage({ contact })));
  site.get('/privacy', (req, res) => res.send(privacyPage({ contact, legal })));

  // The form on the Home page. Works without JavaScript: errors show next to the fields
  // and nothing typed is lost; success goes to the Thank you page.
  site.post('/join', (req, res) => {
    // Hidden field that people never see: only bots fill it. Pretend it worked, save nothing.
    if (String(req.body?.website ?? '').trim()) return res.redirect(303, '/thank-you');
    if (!enquiryLimiter.take(req.ip)) return res.status(429).type('text').send('Too many tries. Please try again later.');
    const { errors, value } = validateEnquiry(req.body);
    if (Object.keys(errors).length) {
      return res.status(422).send(homePage({ values: { ...value, consent: Boolean(req.body?.consent) }, errors, contact, legal }));
    }
    saveEnquiry(value);
    return res.redirect(303, '/thank-you');
  });
  app.use(site);

  // ---------- Public: the website form posts here ----------
  app.use('/api', (req, res, next) => {
    if (config.allowedOrigin && req.headers.origin === config.allowedOrigin) {
      res.set('Access-Control-Allow-Origin', config.allowedOrigin);
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.post('/api/enquiries', (req, res) => {
    if (!enquiryLimiter.take(req.ip)) return res.status(429).json({ ok: false, error: 'Too many tries. Please try again later.' });
    const { errors, value } = validateEnquiry(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });
    saveEnquiry(value);
    // Same answer whether the email is new or not, so nobody can test which emails are on the list.
    return res.status(201).json({ ok: true });
  });

  // ---------- Read-only API for the AI agent ----------
  // Its own key (Authorization: Bearer <key>), separate from the admin password. Only GET,
  // only over the read-only connection, never the admins or sessions tables.
  // Off (404) until AGENT_READ_TOKEN_SHA256 is set.
  const agentEnabled = Boolean(readDb && /^[0-9a-f]{64}$/.test(config.agentReadTokenHash));
  const agentRepo = agentEnabled ? makeAgentRepo(readDb) : null;
  const agentLimiter = createLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
  const agent = express.Router();

  agent.use((req, res, next) => {
    if (!agentEnabled) return res.status(404).json({ ok: false, error: 'Not found.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token && safeEqual(sha256(token), config.agentReadTokenHash)) return next();
    // Count only failed tries, so a wrong or stolen-and-guessed key is slowed down.
    if (!agentLimiter.take(req.ip)) return res.status(429).json({ ok: false, error: 'Too many tries. Please try again later.' });
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  });

  agent.get('/summary', (req, res) => {
    res.json({ ok: true, counts: agentRepo.counts(), latest: agentRepo.list({ limit: 5 }) });
  });

  agent.get('/enquiries', (req, res) => {
    const status = String(req.query.status ?? '');
    const since = String(req.query.since ?? '');
    const limit = Number(req.query.limit ?? 100);
    if (status && !STATUSES.includes(status)) return res.status(422).json({ ok: false, error: `status must be one of: ${STATUSES.join(', ')}` });
    if (since && !/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(since)) return res.status(422).json({ ok: false, error: 'since must be a date like 2026-11-25' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return res.status(422).json({ ok: false, error: 'limit must be 1 to 500' });
    return res.json({ ok: true, enquiries: agentRepo.list({ status, since, limit }) });
  });

  agent.get('/enquiries/:id', (req, res) => {
    const found = /^\d+$/.test(req.params.id) && agentRepo.get(Number(req.params.id));
    if (!found) return res.status(404).json({ ok: false, error: 'Not found.' });
    return res.json({ ok: true, ...found });
  });

  agent.use((req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));
  app.use('/api/agent', agent);

  app.use('/api', (err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).json({ ok: false, error: err.status === 400 ? 'Bad request.' : 'Something went wrong.' });
  });

  // ---------- Admin ----------
  const admin = express.Router();

  admin.use((req, res, next) => {
    res.set({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });

  admin.use('/assets', express.static(publicDir, { maxAge: '1h' }));

  const getSession = (req) => {
    const token = readCookie(req, COOKIE);
    return token ? repo.getSession(sha256(token)) : null;
  };

  const requireAuth = (req, res, next) => {
    const session = getSession(req);
    if (!session) return res.redirect(303, '/admin');
    req.session = session;
    return next();
  };

  const requireCsrf = (req, res, next) => {
    if (!safeEqual(req.body?._csrf ?? '', req.session.csrf)) return res.status(403).type('text').send('Forbidden');
    return next();
  };

  const idOf = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null);

  admin.get('/', (req, res) => {
    if (getSession(req)) return res.redirect(303, '/admin/enquiries');
    return res.send(loginPage());
  });

  admin.post('/login', async (req, res, next) => {
    try {
      if (!loginLimiter.take(req.ip)) {
        return res.status(429).send(loginPage({ error: 'Too many tries. Please wait a few minutes.' }));
      }
      const email = String(req.body?.email ?? '').slice(0, 254);
      const password = String(req.body?.password ?? '').slice(0, 1024);
      const account = repo.adminByEmail(email);
      const ok = await verifyPassword(password, account ? account.password_hash : await dummyHash());
      if (!account || !ok) return res.status(401).send(loginPage({ error: 'Wrong email or password.', email }));

      const token = randomToken();
      const expires = new Date(Date.now() + config.sessionDays * 86400 * 1000);
      repo.createSession(sha256(token), Number(account.id), randomToken(), expires.toISOString());
      res.cookie(COOKIE, token, {
        httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/admin', expires,
      });
      return res.redirect(303, '/admin/enquiries');
    } catch (error) {
      return next(error);
    }
  });

  admin.post('/logout', requireAuth, requireCsrf, (req, res) => {
    repo.deleteSession(sha256(readCookie(req, COOKIE)));
    res.clearCookie(COOKIE, { path: '/admin' });
    return res.redirect(303, '/admin');
  });

  const filters = (req) => ({
    q: String(req.query.q ?? '').trim().slice(0, 200),
    status: STATUSES.includes(req.query.status) ? req.query.status : '',
  });

  admin.get('/enquiries', requireAuth, (req, res) => {
    const { q, status } = filters(req);
    res.send(
      listPage({
        session: req.session, rows: repo.list({ q, status }), counts: repo.counts(), query: q, status,
        message: ['status', 'note', 'deleted'].includes(req.query.msg) ? req.query.msg : '',
      }),
    );
  });

  admin.get('/enquiries.csv', requireAuth, (req, res) => {
    const { q, status } = filters(req);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="enquiries-${stamp}.csv"`);
    res.send(enquiriesCsv(repo.list({ q, status })));
  });

  const showDetail = (req, res, extra = {}) => {
    const id = idOf(req);
    const found = id && repo.get(id);
    if (!found) return res.status(404).send(notFoundPage(req.session));
    return res.status(extra.noteError ? 422 : 200).send(detailPage({ session: req.session, ...found, ...extra }));
  };

  admin.get('/enquiries/:id', requireAuth, (req, res) => {
    showDetail(req, res, { message: ['status', 'note'].includes(req.query.msg) ? req.query.msg : '' });
  });

  admin.post('/enquiries/:id/status', requireAuth, requireCsrf, (req, res) => {
    const id = idOf(req);
    if (!id || !STATUSES.includes(req.body.status) || !repo.setStatus(id, req.body.status)) {
      return res.status(id && !STATUSES.includes(req.body.status) ? 422 : 404).send(notFoundPage(req.session));
    }
    return res.redirect(303, `/admin/enquiries/${id}?msg=status`);
  });

  admin.post('/enquiries/:id/notes', requireAuth, requireCsrf, (req, res) => {
    const id = idOf(req);
    const { value, error } = validateNote(req.body);
    if (error) return showDetail(req, res, { noteError: error });
    if (!id || !repo.addNote(id, value)) return res.status(404).send(notFoundPage(req.session));
    return res.redirect(303, `/admin/enquiries/${id}?msg=note`);
  });

  admin.post('/enquiries/:id/delete', requireAuth, requireCsrf, (req, res) => {
    const id = idOf(req);
    if (!id || !repo.remove(id)) return res.status(404).send(notFoundPage(req.session));
    return res.redirect(303, '/admin/enquiries?msg=deleted');
  });

  admin.use((req, res) => {
    const session = getSession(req);
    res.status(404).send(session ? notFoundPage(session) : loginPage());
  });

  app.use('/admin', admin);

  app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ ok: false, error: 'Not found.' });
    return res.status(404).send(siteNotFoundPage({ contact }));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status === 400 || err.type === 'entity.parse.failed') return res.status(400).type('text').send('Bad request');
    console.error(err);
    return res.status(500).type('text').send('Something went wrong.');
  });

  return app;
}
