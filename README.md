# project1: enquiries and admin

The project1 website and its admin side, from the PRD for project1 (parts A and B).
Visitors read the Home page and join the waiting list, and Luis follows up each enquiry in the admin.

## What is in it

- **Public website:** Home (the 11 blocks, with the form in block 10), Thank you, Privacy and Not found.
  Works without JavaScript: errors show next to the fields and nothing typed is lost.
  The text is the draft in the Copy page in project1 HQ. Change it there first, then in `src/site.js`.
  The Home page never links to the admin.
- **Form endpoints:** `POST /join` (the Home form) and `POST /api/enquiries` (JSON, for any other form) with `name`, `email`, `answer` (optional) and `consent`.
  - Missing or wrong fields give `422` with the messages from the Copy page.
  - The same email sent twice makes one enquiry.
  - The answer is the same for a new and a known email, so nobody can test which emails are on the list.
- **Email to the owner** for each new enquiry (not for a repeat of the same email): name, email, answer and a link to the
  enquiry in the admin. Replying to it writes to the student. Sent over HTTPS with Resend (`RESEND_API_KEY`), which works on every host, or
  over SMTP (`SMTP_URL`) where the host allows it (Railway only allows SMTP on its Pro plan). Off until `NOTIFY_EMAIL` and one
  of the two are set. It never slows down or breaks the form: if sending fails, the enquiry is
  still saved and the visitor still sees the Thank you page.
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
cp .env.example .env     # then set ADMIN_EMAIL, ADMIN_PASSWORD (12+ characters) and CONTACT_EMAIL
npm start                # http://localhost:3000/admin
npm test                 # 51 tests
```

- The first start creates the admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, if there is none yet.
  To change the email or password later: `npm run set-admin` (this signs the admin out everywhere).
  On a host without a terminal, set the new `ADMIN_PASSWORD` and `ADMIN_RESET=true`, let it restart once,
  then remove `ADMIN_RESET`.
- `npm run seed:demo` adds three clearly marked `[TEST]` enquiries so the screens are not empty.
  It refuses to run when `NODE_ENV=production`.
- Home is at `http://localhost:3000/`. `CONTACT_EMAIL` shows in the footer and on the Privacy page; until it is set they show
  "[contact email to be added]".
- The Privacy page and the short data protection text next to the form need `CONTROLLER_NAME`, `CONTROLLER_ADDRESS`,
  `CONTROLLER_TAX_ID` (optional) and `RETENTION_PERIOD` (for example "12 months after your last message"). Until they are set the
  pages show "[... to be added]" placeholders, so fill them in before launch.
- The public pages ask search engines not to index them until `ALLOW_INDEXING=true` (set it at launch, when the text is final).
- Settings are in `.env.example`. On a real host set `NODE_ENV=production` (Secure cookies), `TRUST_PROXY=1`
  behind a proxy, and point `DATABASE_PATH` at a persistent volume. Without a volume the data is lost on every deploy.

## Logo

The word "project" and a turtle seen from above in the place of the 1; the 1 is in the centre plate of the shell
(approved by Luis, 2026-11-20). `src/logo.js` draws it for the web pages, using only the Recreo tokens (colours come from CSS
classes, so the page's CSP needs no inline styles). The pages show it in the top bar and the footer and use `public/favicon.svg`
and `public/apple-touch-icon.png` as icons. The standalone files are in `brand/logo/` (on light, on dark, on main, on accent and
the icon). To rebuild the SVG files after a change to the logo: `node scripts/build-logo.js` (the touch icon PNG is a screenshot of
`public/favicon.svg` at 180 px). The Figma source is the "Logo" component set on the "Design system" page.

## Privacy

The Privacy page covers what GDPR Article 13 and the Spanish LOPDGDD ask for when data is collected through a form: who is
responsible, what is collected, why and on what basis (consent), who receives it (Railway, Resend, the email provider), the move
outside the EU, how long it is kept, the rights, the complaint route to the AEPD, and the minimum age of 14. The short first layer sits next
to the form. The public pages set no cookies and load nothing from other servers: the fonts are in `public/fonts` (SIL Open Font
License, licences included). This is a checklist-level review, not legal advice: have a Spanish data protection adviser read the
final text, and check each provider's data processing terms.

## Security notes

- Passwords: scrypt. Sessions: random token in an `HttpOnly`, `SameSite=Strict` cookie limited to `/admin`;
  only a hash of the token is stored. Every change needs a CSRF token.
- Login: 10 tries per 15 minutes per address. A wrong email and a wrong password look the same.
- Public form: 20 tries per hour per address. Set `ALLOWED_ORIGIN` if the website is served from another address.
- CSV cells that start with `=`, `+`, `-` or `@` are prefixed so a spreadsheet cannot run them as formulas.

## Design

`public/tokens.css` holds the Recreo tokens from the Brand guide: colours, Bricolage Grotesque and DM Sans, the spacing scale
and the three corner sizes. `site.css` and `admin.css` use only those, and the text sizes are H1 64, H2 40, H3 28, Body 18,
Small 14 and Label 14 (on a phone H1 is 40 and H2 is 28). Buttons are Main and Second, and sit on light backgrounds only.

The admin's Input field, Status tag (six variants) and Table row are in the Figma "Design system" page and on the Brand guide.
The first-screen designs are on the "Designs" page in the same Figma file.

## Not in this version

- Final text. The Home blocks marked Draft or Blocked in the Copy page (problem, benefits, proof, questions, footer and Privacy)
  still need Luis's review, and real student quotes. The Privacy text follows the GDPR and LOPDGDD checklist but has not been read by a lawyer.
- A final first-screen picture.
- Paging of the list (fine for a waiting list, revisit past a few hundred enquiries).
- More than one admin, roles, and syncing with the Notion CRM.
