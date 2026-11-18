# project1: enquiries and admin

The website's backend. The public form posts here, and the admin side is where Luis follows up each enquiry.
The scope is the PRD for project1 (parts A and B). The public landing page itself is not in this repo yet.

## What is in it

- **Public endpoint:** `POST /api/enquiries` with `name`, `email`, `answer` (optional) and `consent`.
  - Missing or wrong fields give `422` with the messages from the Copy page.
  - The same email sent twice makes one enquiry.
  - The answer is the same for a new and a known email, so nobody can test which emails are on the list.
- **Admin side** at `/admin`, for one admin, with email and password. No public sign-up, no link from the website,
  and `noindex` on every page.
  - Enquiries list, newest first, with the count per status.
  - Search by name or email, and a status filter.
  - Export the list (or the filtered list) as CSV.
  - Detail page: full answer, change status, dated notes, delete (with its notes).
  - Works on a laptop and on a phone (the table becomes one card per enquiry).
- **Statuses:** Lead, Contacted, Call booked, Pilot, Customer, Lost. The same six as the CRM in project1 HQ.
  Every enquiry starts as Lead.

## Run it

Needs Node 22.13 or newer. No other tools: the database is the SQLite built into Node.

```bash
npm install
cp .env.example .env     # then set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)
npm start                # http://localhost:3000/admin
npm test                 # 21 tests
```

- The first start creates the admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, if there is none yet.
  To change the email or password later: `npm run set-admin` (this signs the admin out everywhere).
- `npm run seed:demo` adds three clearly marked `[TEST]` enquiries so the screens are not empty.
  It refuses to run when `NODE_ENV=production`.
- Settings are in `.env.example`. On a real host set `NODE_ENV=production` (Secure cookies), `TRUST_PROXY=1`
  behind a proxy, and point `DATABASE_PATH` at a persistent volume. Without a volume the data is lost on every deploy.

## Security notes

- Passwords: scrypt. Sessions: random token in an `HttpOnly`, `SameSite=Strict` cookie limited to `/admin`;
  only a hash of the token is stored. Every change needs a CSRF token.
- Login: 10 tries per 15 minutes per address. A wrong email and a wrong password look the same.
- Public form: 20 tries per hour per address. Set `ALLOWED_ORIGIN` if the website is served from another address.
- CSV cells that start with `=`, `+`, `-` or `@` are prefixed so a spreadsheet cannot run them as formulas.

## Design

`public/admin.css` uses only the Recreo tokens from the Brand guide: colours, Bricolage Grotesque and DM Sans,
the six text sizes, the spacing scale and the three corner sizes. Buttons are Main and Second.

Three things the Figma design system does not have yet are built in code to this spec:
the input field, the table row, and the six status tags (all from system colours).
They still need adding to the "Design system" page in Figma and to the Components list in the Brand guide.

## Not in this version

- **Email to Luis on each new enquiry.** Needs an email service. The hook is the one place in `src/app.js`
  after `repo.createEnquiry(...)`.
- The public pages (Home, Thank you, Privacy, Not found) and the form on them.
- Paging of the list (fine for a waiting list, revisit past a few hundred enquiries).
- More than one admin, roles, and syncing with the Notion CRM.
