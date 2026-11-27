import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Same six statuses as the CRM in project1 HQ.
export const STATUSES = ['Lead', 'Contacted', 'Call booked', 'Pilot', 'Customer', 'Lost'];

export const STATUS_MEANING = {
  Lead: 'The form was just sent. Every enquiry starts here.',
  Contacted: 'You wrote to the student.',
  'Call booked': 'A call has a date.',
  Pilot: 'The student is trying project1.',
  Customer: 'The student pays.',
  Lost: 'The student said no or stopped answering. Possible from any step.',
};

const statusList = STATUSES.map((s) => `'${s}'`).join(', ');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_key TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL DEFAULT '',
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Lead' CHECK (status IN (${statusList})),
  created_at TEXT NOT NULL,
  accepted_email_at TEXT
);
CREATE INDEX IF NOT EXISTS enquiries_created ON enquiries (created_at DESC);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_enquiry ON notes (enquiry_id);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Databases made before the acceptance email get its column added once.
  const columns = db.prepare('PRAGMA table_info(enquiries)').all().map((c) => c.name);
  if (!columns.includes('accepted_email_at')) db.exec('ALTER TABLE enquiries ADD COLUMN accepted_email_at TEXT');
  return db;
}

// A second connection to the same file that can only read: SQLite refuses every write on it.
// Open it after openDb, so the file and its tables already exist.
export function openReadOnlyDb(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec('PRAGMA query_only = ON;');
  return db;
}

// Read-only queries for the AI agent. Never touches the admins or sessions tables.
export function makeAgentRepo(db) {
  const q = {
    list: db.prepare(
      `SELECT e.id, e.name, e.email, e.answer, e.status, e.created_at,
              (SELECT COUNT(*) FROM notes n WHERE n.enquiry_id = e.id) AS note_count,
              (SELECT n.body FROM notes n WHERE n.enquiry_id = e.id ORDER BY n.id DESC LIMIT 1) AS last_note
         FROM enquiries e
        WHERE (? = '' OR e.status = ?)
          AND (? = '' OR e.created_at >= ?)
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ?`,
    ),
    counts: db.prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status'),
    one: db.prepare('SELECT id, name, email, answer, status, consent_at, created_at FROM enquiries WHERE id = ?'),
    notes: db.prepare('SELECT id, body, created_at FROM notes WHERE enquiry_id = ? ORDER BY id DESC'),
  };
  const num = (row) => row && { ...row, id: Number(row.id), ...(row.note_count !== undefined ? { note_count: Number(row.note_count) } : {}) };

  return {
    list({ status = '', since = '', limit = 100 } = {}) {
      const s = STATUSES.includes(status) ? status : '';
      return q.list.all(s, s, since, since, limit).map(num);
    },
    counts() {
      const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      let total = 0;
      for (const row of q.counts.all()) {
        byStatus[row.status] = Number(row.n);
        total += Number(row.n);
      }
      return { byStatus, total };
    },
    get(id) {
      const enquiry = q.one.get(id);
      return enquiry ? { enquiry: num(enquiry), notes: q.notes.all(id).map(num) } : null;
    },
  };
}

export const emailKey = (email) => String(email).trim().toLowerCase();

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function makeRepo(db) {
  const q = {
    byEmailKey: db.prepare('SELECT id, answer FROM enquiries WHERE email_key = ?'),
    insert: db.prepare(
      `INSERT INTO enquiries (name, email, email_key, answer, consent_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Lead', ?)`,
    ),
    fillAnswer: db.prepare('UPDATE enquiries SET answer = ? WHERE id = ?'),
    list: db.prepare(
      `SELECT e.id, e.name, e.email, e.answer, e.status, e.created_at,
              (SELECT n.body FROM notes n WHERE n.enquiry_id = e.id ORDER BY n.id DESC LIMIT 1) AS last_note,
              (SELECT COUNT(*) FROM notes n WHERE n.enquiry_id = e.id) AS note_count
         FROM enquiries e
        WHERE (? = '' OR e.status = ?)
          AND (? = '' OR e.name LIKE ? ESCAPE '\\' OR e.email LIKE ? ESCAPE '\\')
        ORDER BY e.created_at DESC, e.id DESC`,
    ),
    counts: db.prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status'),
    one: db.prepare('SELECT * FROM enquiries WHERE id = ?'),
    notes: db.prepare('SELECT id, body, created_at FROM notes WHERE enquiry_id = ? ORDER BY id DESC'),
    setStatus: db.prepare('UPDATE enquiries SET status = ? WHERE id = ?'),
    addNote: db.prepare('INSERT INTO notes (enquiry_id, body, created_at) VALUES (?, ?, ?)'),
    remove: db.prepare('DELETE FROM enquiries WHERE id = ?'),
    claimAcceptance: db.prepare('UPDATE enquiries SET accepted_email_at = ? WHERE id = ? AND accepted_email_at IS NULL'),
    releaseAcceptance: db.prepare('UPDATE enquiries SET accepted_email_at = NULL WHERE id = ? AND accepted_email_at = ?'),
    adminCount: db.prepare('SELECT COUNT(*) AS n FROM admins'),
    adminByKey: db.prepare('SELECT * FROM admins WHERE email_key = ?'),
    adminDeleteAll: db.prepare('DELETE FROM admins'),
    adminInsert: db.prepare('INSERT INTO admins (email, email_key, password_hash) VALUES (?, ?, ?)'),
    sessionInsert: db.prepare('INSERT INTO sessions (token_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)'),
    sessionGet: db.prepare('SELECT admin_id, csrf, expires_at FROM sessions WHERE token_hash = ?'),
    sessionDelete: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    sessionPurge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  };

  return {
    // Public form. The same email sent twice makes one enquiry, not two.
    createEnquiry({ name, email, answer }) {
      const key = emailKey(email);
      const now = new Date().toISOString();
      const existing = q.byEmailKey.get(key);
      if (existing) {
        if (!existing.answer && answer) q.fillAnswer.run(answer, existing.id);
        return { id: Number(existing.id), duplicate: true };
      }
      const info = q.insert.run(name, email, key, answer, now, now);
      return { id: Number(info.lastInsertRowid), duplicate: false };
    },
    list({ q: search = '', status = '' } = {}) {
      const like = `%${escapeLike(search)}%`;
      const s = STATUSES.includes(status) ? status : '';
      return q.list.all(s, s, search, like, like);
    },
    counts() {
      const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      let total = 0;
      for (const row of q.counts.all()) {
        out[row.status] = Number(row.n);
        total += Number(row.n);
      }
      return { byStatus: out, total };
    },
    get(id) {
      const enquiry = q.one.get(id);
      return enquiry ? { enquiry, notes: q.notes.all(id) } : null;
    },
    setStatus(id, status) {
      if (!STATUSES.includes(status)) return false;
      return q.setStatus.run(status, id).changes > 0;
    },
    addNote(id, body) {
      if (!q.one.get(id)) return false;
      q.addNote.run(id, body, new Date().toISOString());
      return true;
    },
    remove(id) {
      return q.remove.run(id).changes > 0;
    },
    // The acceptance email: mark it sent before sending, so two clicks can never send it twice.
    // Returns the timestamp it claimed, or null if it was already sent.
    claimAcceptance(id) {
      const at = new Date().toISOString();
      return q.claimAcceptance.run(at, id).changes > 0 ? at : null;
    },
    // Undo the claim when sending failed, so it can be tried again.
    releaseAcceptance(id, at) {
      q.releaseAcceptance.run(id, at);
    },
    // Admin and sessions
    hasAdmin: () => Number(q.adminCount.get().n) > 0,
    adminByEmail: (email) => q.adminByKey.get(emailKey(email)),
    setAdmin(email, passwordHash) {
      db.exec('BEGIN');
      try {
        q.adminDeleteAll.run(); // version 1 has one admin only
        q.adminInsert.run(email.trim(), emailKey(email), passwordHash);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    createSession(tokenHash, adminId, csrf, expiresAt) {
      q.sessionPurge.run(new Date().toISOString());
      q.sessionInsert.run(tokenHash, adminId, csrf, expiresAt);
    },
    getSession(tokenHash) {
      const row = q.sessionGet.get(tokenHash);
      if (!row || row.expires_at < new Date().toISOString()) return null;
      return { adminId: Number(row.admin_id), csrf: row.csrf };
    },
    deleteSession: (tokenHash) => q.sessionDelete.run(tokenHash),
  };
}
