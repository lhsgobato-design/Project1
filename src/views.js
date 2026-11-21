import { STATUSES, STATUS_MEANING } from './db.js';

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TZ = 'Europe/Madrid';
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ,
});
export const fmtDate = (iso) => dateFmt.format(new Date(iso));
export const fmtDateTime = (iso) => dateTimeFmt.format(new Date(iso));

const slug = (status) => status.toLowerCase().replace(/\s+/g, '-');
const clip = (text, n) => (text.length > n ? `${text.slice(0, n).trimEnd()}…` : text);

const MESSAGES = {
  status: 'Status saved.',
  note: 'Note added.',
  deleted: 'Enquiry deleted.',
};

export const statusTag = (status) => `<span class="tag tag-${slug(status)}">${esc(status)}</span>`;

function layout({ title, body, csrf, nav = true }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · project1 admin</title>
<link rel="icon" href="/admin/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/admin/assets/apple-touch-icon.png">
<link rel="stylesheet" href="/admin/assets/fonts.css">
<link rel="stylesheet" href="/admin/assets/tokens.css">
<link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
${nav ? `<header class="bar">
  <div class="bar-name"><a class="wordmark" href="/admin/enquiries">project1</a><span class="label soft">Admin</span></div>
  <form method="post" action="/admin/logout">
    <input type="hidden" name="_csrf" value="${esc(csrf)}">
    <button class="btn btn-second" type="submit">Log out</button>
  </form>
</header>` : ''}
<main class="wrap">
${body}
</main>
</body>
</html>`;
}

export function loginPage({ error = '', email = '' } = {}) {
  return layout({
    title: 'Log in',
    nav: false,
    body: `<section class="login card">
  <h1 class="h3">Admin</h1>
  <p class="soft">Log in to see the enquiries.</p>
  ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login" class="stack">
    <div class="field">
      <label class="label" for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}">
    </div>
    <div class="field">
      <label class="label" for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button class="btn" type="submit">Log in</button>
  </form>
</section>`,
  });
}

export function listPage({ session, rows, counts, query, status, message }) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (status) params.set('status', status);
  const csvHref = `/admin/enquiries.csv${params.toString() ? `?${params}` : ''}`;
  const filtered = Boolean(query || status);

  const tiles = STATUSES.map((s) => {
    const active = status === s ? ' is-active' : '';
    return `<a class="count${active}" href="/admin/enquiries?status=${encodeURIComponent(s)}"${active ? ' aria-current="true"' : ''}>
      <span class="count-n">${counts.byStatus[s]}</span><span class="label">${esc(s)}</span></a>`;
  }).join('');

  const options = ['<option value="">All statuses</option>']
    .concat(STATUSES.map((s) => `<option${s === status ? ' selected' : ''}>${esc(s)}</option>`))
    .join('');

  const body = rows.length
    ? `<table class="table">
  <thead><tr><th>Name</th><th>Email</th><th>Answer</th><th>Date</th><th>Status</th><th>Last note</th></tr></thead>
  <tbody>
  ${rows
    .map(
      (r) => `<tr>
    <td data-label="Name"><a class="row-link" href="/admin/enquiries/${r.id}">${esc(r.name)}</a></td>
    <td data-label="Email" class="email">${esc(r.email)}</td>
    <td data-label="Answer">${r.answer ? esc(clip(r.answer, 90)) : '<span class="soft">No answer</span>'}</td>
    <td data-label="Date" class="nowrap">${esc(fmtDate(r.created_at))}</td>
    <td data-label="Status">${statusTag(r.status)}</td>
    <td data-label="Last note">${r.last_note ? esc(clip(r.last_note, 60)) : '<span class="soft">None</span>'}</td>
  </tr>`,
    )
    .join('\n  ')}
  </tbody>
</table>`
    : `<p class="empty">${filtered ? 'No enquiries match.' : 'No enquiries yet.'}</p>`;

  return layout({
    title: 'Enquiries',
    csrf: session.csrf,
    body: `<h1 class="h2">Enquiries</h1>
${message ? `<p class="notice" role="status">${esc(MESSAGES[message] || '')}</p>` : ''}
<div class="counts" aria-label="Enquiries per status">${tiles}</div>
<form class="filters" method="get" action="/admin/enquiries">
  <div class="field grow">
    <label class="label" for="q">Search by name or email</label>
    <input id="q" name="q" type="search" value="${esc(query)}" autocomplete="off">
  </div>
  <div class="field">
    <label class="label" for="status">Status</label>
    <select id="status" name="status">${options}</select>
  </div>
  <div class="actions">
    <button class="btn" type="submit">Search</button>
    <a class="btn btn-second" href="${esc(csvHref)}">Export CSV</a>
    ${filtered ? '<a class="btn btn-second" href="/admin/enquiries">Clear</a>' : ''}
  </div>
</form>
<p class="small soft">${rows.length} of ${counts.total} ${counts.total === 1 ? 'enquiry' : 'enquiries'}, newest first.</p>
${body}`,
  });
}

export function detailPage({ session, enquiry, notes, message, noteError }) {
  const meanings = STATUSES.map(
    (s) => `<li>${statusTag(s)} <span>${esc(STATUS_MEANING[s])}</span></li>`,
  ).join('');
  const options = STATUSES.map((s) => `<option${s === enquiry.status ? ' selected' : ''}>${esc(s)}</option>`).join('');

  return layout({
    title: enquiry.name,
    csrf: session.csrf,
    body: `<p><a class="back" href="/admin/enquiries">← All enquiries</a></p>
<h1 class="h2 break">${esc(enquiry.name)}</h1>
${message ? `<p class="notice" role="status">${esc(MESSAGES[message] || '')}</p>` : ''}
<div class="detail">
  <section class="card">
    <p class="label soft">Contact</p>
    <p class="break"><a href="mailto:${esc(enquiry.email)}">${esc(enquiry.email)}</a></p>
    <p class="small soft">Sent on ${esc(fmtDateTime(enquiry.created_at))}. Agreed to be contacted on ${esc(fmtDateTime(enquiry.consent_at))}.</p>
    <p class="label soft">What is your biggest doubt about studying in Spain?</p>
    <p class="answer">${enquiry.answer ? esc(enquiry.answer) : '<span class="soft">No answer given.</span>'}</p>
  </section>

  <section class="card">
    <h2 class="h3">Status</h2>
    <p>${statusTag(enquiry.status)}</p>
    <form method="post" action="/admin/enquiries/${enquiry.id}/status" class="stack">
      <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
      <div class="field">
        <label class="label" for="new-status">Change status</label>
        <select id="new-status" name="status">${options}</select>
      </div>
      <button class="btn" type="submit">Save status</button>
    </form>
    <details class="meanings">
      <summary class="label">What the statuses mean</summary>
      <ul>${meanings}</ul>
    </details>
  </section>

  <section class="card wide">
    <h2 class="h3">Notes</h2>
    <form method="post" action="/admin/enquiries/${enquiry.id}/notes" class="stack">
      <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
      <div class="field">
        <label class="label" for="note">Add a note</label>
        <textarea id="note" name="note" rows="3" maxlength="2000" required></textarea>
        ${noteError ? `<p class="alert" role="alert">${esc(noteError)}</p>` : ''}
      </div>
      <button class="btn" type="submit">Add note</button>
    </form>
    ${
      notes.length
        ? `<ul class="notes">${notes
            .map((n) => `<li><span class="label soft">${esc(fmtDateTime(n.created_at))}</span><p class="answer">${esc(n.body)}</p></li>`)
            .join('')}</ul>`
        : '<p class="soft">No notes yet.</p>'
    }
  </section>

  <section class="card wide">
    <h2 class="h3">Delete this enquiry</h2>
    <p class="soft">For when a person asks for their data to be removed. This also deletes its notes and cannot be undone.</p>
    <details class="confirm">
      <summary class="btn btn-second">Delete this enquiry</summary>
      <form method="post" action="/admin/enquiries/${enquiry.id}/delete" class="stack">
        <input type="hidden" name="_csrf" value="${esc(session.csrf)}">
        <p class="break">Delete “${esc(enquiry.name)}” and all its notes?</p>
        <button class="btn" type="submit">Yes, delete</button>
      </form>
    </details>
  </section>
</div>`,
  });
}

export function notFoundPage(session) {
  return layout({
    title: 'Not found',
    csrf: session?.csrf,
    nav: Boolean(session),
    body: `<h1 class="h2">Not found</h1><p><a class="btn" href="/admin/enquiries">Back to enquiries</a></p>`,
  });
}

// CSV for Excel and Sheets. Cells that start with = + - @ are prefixed so they
// cannot run as formulas when the file is opened.
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function enquiriesCsv(rows) {
  const header = ['Name', 'Email', 'Answer', 'Date', 'Status', 'Last note', 'Notes'];
  const lines = [header, ...rows.map((r) => [r.name, r.email, r.answer, r.created_at, r.status, r.last_note ?? '', r.note_count])];
  return `﻿${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
