import { esc } from './views.js';

// The text on these pages is the draft in the Copy page in project1 HQ.
// Each block is marked there as Ready, Draft or Blocked. Change the text there first.

const LINE =
  'project1 is being built to help students who came from abroad to study at a university in Barcelona understand how grading, classes and schedules work. Join the waiting list and tell us your doubt.';
const DESCRIPTION =
  'project1 is being built to help students who came from abroad to study in Barcelona understand how grading, classes and schedules work. Join the waiting list.';
const QUESTIONS = ['How does grading work?', 'What if I fail?', 'How do I enrol?', 'How do I study here?'];

const FAQ = [
  ['What is project1?', 'project1 is a way for students from abroad to understand how their new school works without putting their grades at risk, because project1 is your number one friend.'],
  ['Does joining cost anything?', 'No. This website takes no payments.'],
  ['What will it cost later?', 'We have not set a price yet.'],
  ['What happens after I join?', 'We read your answer and may write to you.'],
  ['Who sees my details?', 'Only the founder of project1 reads them. They are stored and sent by service providers, which the Privacy page names.'],
  ['Can I ask you to delete my details?', 'Yes. Write to us and we delete them.'],
];

function contactLink(email) {
  return email
    ? `<a href="mailto:${esc(email)}">${esc(email)}</a>`
    : '<span>[contact email to be added]</span>';
}

const todo = (label) => `<span>[${label} to be added]</span>`;
const legalValue = (value, label) => (value ? esc(value) : todo(label));

// The short first layer of the data protection information, shown next to the form (the full text is on the Privacy page).
function formSummary({ contact, legal }) {
  return `<div class="small soft summary">
        <p><strong>Data protection.</strong> Responsible: ${legalValue(legal.name, 'name of the person or company responsible')}. Purpose: to contact you about project1. Basis: your consent. You must be 14 or older. You can ask us to see, correct or delete your details, or take back your consent, at ${contactLink(contact)}. <a href="/privacy">Read the full Privacy page.</a></p>
      </div>`;
}

function layout({ title, description = DESCRIPTION, body, noindex = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="stylesheet" href="/assets/fonts.css">
<link rel="stylesheet" href="/assets/tokens.css">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
${body}
</body>
</html>`;
}

const joinButton = (extra = '') =>
  `<a class="btn${extra}" href="#join"><span class="long">Join the waiting list</span><span class="short">Join the list</span></a>`;

function topBar({ withButton }) {
  return `<header class="bar">
  <a class="wordmark" href="/">project1</a>
  ${withButton ? joinButton() : ''}
</header>`;
}

function footer(contact) {
  return `<footer class="footer">
  <div class="inner">
    <p class="wordmark">project1</p>
    <p>Contact: ${contactLink(contact)}</p>
    <p class="small on-dark-soft">We use your name, email and answer to contact you about project1. Only the founder reads them, and you can ask us to delete them at any time.</p>
    <p><a href="/privacy">Privacy</a></p>
  </div>
</footer>`;
}

function fieldError(errors, key) {
  return errors[key] ? `<p class="error" id="${key}-error" role="alert">${esc(errors[key])}</p>` : '';
}

function joinForm({ values, errors, contact, legal }) {
  // After a failed send, focus (and so scroll to) the first field that needs fixing.
  const first = ['name', 'email', 'answer', 'consent'].find((key) => errors[key]);
  const invalid = (key) =>
    errors[key] ? ` aria-invalid="true" aria-describedby="${key}-error"${key === first ? ' autofocus' : ''}` : '';
  return `<form class="card form" method="post" action="/join" novalidate>
    <div class="field">
      <label class="label" for="name">Name</label>
      <input id="name" name="name" type="text" autocomplete="name" required maxlength="120" value="${esc(values.name)}"${invalid('name')}>
      ${fieldError(errors, 'name')}
    </div>
    <div class="field">
      <label class="label" for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required maxlength="254" value="${esc(values.email)}"${invalid('email')}>
      ${fieldError(errors, 'email')}
    </div>
    <div class="field">
      <label class="label" for="answer">What is the hardest part of studying in Spain for you? <span class="soft">Optional</span></label>
      <textarea id="answer" name="answer" rows="4" maxlength="2000"${invalid('answer')}>${esc(values.answer)}</textarea>
      ${fieldError(errors, 'answer')}
    </div>
    <div class="field">
      <label class="check" for="consent">
        <input id="consent" name="consent" type="checkbox" value="on"${values.consent ? ' checked' : ''}${invalid('consent')}>
        <span>I agree to be contacted by project1. <a href="/privacy">Privacy</a></span>
      </label>
      ${fieldError(errors, 'consent')}
    </div>
    <div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    ${formSummary({ contact, legal })}
    <button class="btn" type="submit">Join the waiting list</button>
  </form>`;
}

export function homePage({ values = {}, errors = {}, contact = '', legal = {} } = {}) {
  const hasErrors = Object.keys(errors).length > 0;
  return layout({
    title: 'project1: join the waiting list',
    body: `${topBar({ withButton: true })}
<main>
<section class="hero">
  <div class="hero-text">
    <h1 class="h1">New to the Spanish university system? You don't have to figure it out <mark>alone.</mark></h1>
    <p>${esc(LINE)}</p>
    ${joinButton()}
  </div>
  <aside class="picture" aria-label="Questions students ask, and the waiting list">
    <ul class="chips">${QUESTIONS.map((q) => `<li class="tag">${esc(q)}</li>`).join('')}</ul>
    <div class="card">
      <p class="label soft">Waiting list</p>
      <p class="h3">You're on the list.</p>
      <p>We got your answer and may write to you.</p>
    </div>
  </aside>
</section>

<section class="section split">
  <div>
    <p class="kicker"><span class="tag">The problem</span></p>
    <h2 class="h2">Nobody explains how it works.</h2>
  </div>
  <p class="lead statement">Academies teach you the subject. University offices help with paperwork. Lawyers help with the visa. But how does grading work? What happens if you fail? How do you enrol, and how do you study here? You are expected to just know.</p>
</section>

<section class="section">
  <p class="kicker"><span class="tag">What we help with</span></p>
  <h2 class="h2">What project1 helps you understand</h2>
  <div class="cards">
    <article class="card card-main"><h3 class="h3">How grading works.</h3><p>How marks are given and what counts.</p></article>
    <article class="card"><h3 class="h3">How classes are run.</h3><p>What a class looks like and what is expected of you.</p></article>
    <article class="card card-accent"><h3 class="h3">How your schedule works.</h3><p>How your timetable is set up and what to plan for.</p></article>
  </div>
  <p class="lead more">And the other things nobody explains when you arrive.</p>
</section>

<section class="section">
  <p class="kicker"><span class="tag">How it works</span></p>
  <h2 class="h2">Three steps</h2>
  <ol class="steps">
    <li class="card"><span class="big">1</span><p>Leave your name, email and one answer. It takes a minute.</p></li>
    <li class="card"><span class="big">2</span><p>We read it and may write to you.</p></li>
    <li class="card"><span class="big">3</span><p>When project1 is ready for the first students, we invite you to try it.</p></li>
  </ol>
</section>

<section class="band">
  <div class="inner">
    <p class="kicker"><span class="tag">Our reason</span></p>
    <h2 class="h2">Why we are doing this</h2>
    <p class="lead">We looked for a service in Barcelona whose main job is to help international students understand how Spanish universities work. We searched in Spanish, Catalan and English in November 2026. We found none. We are at the start, so we have no results to show yet, and we will not make any up.</p>
  </div>
</section>

<section class="section">
  <p class="kicker"><span class="tag">Is it you?</span></p>
  <h2 class="h2">Who it is for</h2>
  <blockquote class="pull h3">Students who came from abroad and study at a university in Barcelona.</blockquote>
</section>

<section class="band band-main">
  <div class="inner">
    <p class="kicker"><span class="tag">The offer</span></p>
    <h2 class="h2">Join the waiting list</h2>
    <div class="card offer">
      <p class="lead">Leave your name, email and one answer. There is nothing to pay: this website takes no payments, and we have not set a price yet.</p>
      ${joinButton()}
    </div>
  </div>
</section>

<section class="section">
  <p class="kicker"><span class="tag">Good to know</span></p>
  <h2 class="h2">Questions</h2>
  <div class="faq">
    ${FAQ.map(([q, a]) => `<details><summary class="h3">${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
  </div>
</section>

<section class="section split" id="join">
  <div>
    <p class="kicker"><span class="tag">Join</span></p>
    <h2 class="h2">Tell us your doubt.</h2>
    <p class="lead">Join the waiting list. It takes a minute.</p>
    ${hasErrors ? '<p class="notice" role="alert">Something is missing. Nothing you typed is lost.</p>' : ''}
  </div>
  ${joinForm({ values, errors, contact, legal })}
</section>
</main>
${footer(contact)}`,
  });
}

export function thankYouPage({ contact = '' } = {}) {
  return layout({
    title: "You're on the list · project1",
    noindex: true,
    body: `${topBar({ withButton: false })}
<main class="page">
  <h1 class="h1">You're on the list.</h1>
  <p class="lead">We got your answer. We will read it and may write to you.</p>
  <a class="btn" href="/">Back to home</a>
</main>
${footer(contact)}`,
  });
}

export function privacyPage({ contact = '', legal = {} } = {}) {
  return layout({
    title: 'Privacy · project1',
    body: `${topBar({ withButton: false })}
<main class="page">
  <h1 class="h1">Privacy</h1>
  <p class="lead">This page says what we do with your details, in plain words. It follows the EU data protection rules (GDPR) and the Spanish law that goes with them.</p>

  <h2 class="h3">Who is responsible</h2>
  <p>${legalValue(legal.name, 'name of the person or company responsible')}.<br>
  Address: ${legalValue(legal.address, 'address')}.<br>
  ${legal.taxId ? `Tax ID: ${esc(legal.taxId)}.<br>` : ''}Contact: ${contactLink(contact)}.</p>

  <h2 class="h3">What we collect</h2>
  <p>Your name, your email, your answer to one question (optional), and your agreement to be contacted. We do not use cookies or tracking tools, and this website loads nothing from other companies' servers.</p>

  <h2 class="h3">Why we use it, and on what basis</h2>
  <p>To contact you about project1 and to learn what students find hardest. We use your details only because you agree to it by ticking the box. You can take back your agreement at any time by writing to us. Doing so does not change what we did before.</p>

  <h2 class="h3">Do you have to give it?</h2>
  <p>You need to give your name and email to join the waiting list, because without them we cannot write to you. The answer is optional. You must be 14 or older to join. If you are younger, ask a parent or guardian to write to us.</p>

  <h2 class="h3">Who sees it</h2>
  <p>Only the founder of project1 reads your details. They are stored and sent by service providers that work for us:</p>
  <ul>
    <li>Railway, which hosts the website and keeps the list. Its servers are in the United States.</li>
    <li>Resend, which sends the founder an email each time someone joins. It is a company in the United States.</li>
    <li>Our email provider, which receives that email.</li>
  </ul>
  <p>We do not sell your details, and we do not use them for automatic decisions or profiling.</p>

  <h2 class="h3">Moving details outside the EU</h2>
  <p>Because these providers are in the United States, your details can be sent outside the EU. For that we rely on the safeguards the EU allows, such as standard contractual clauses.</p>

  <h2 class="h3">How long we keep it</h2>
  <p>${legalValue(legal.retention, 'how long we keep your details')}. After that we delete them.</p>

  <h2 class="h3">Your rights</h2>
  <p>You can ask us to show you your details, correct them, delete them, limit how we use them, stop using them, or give them to you in a file you can reuse. You can also take back your agreement. Write to ${contactLink(contact)}. We answer within one month, and we may ask you to prove who you are.</p>

  <h2 class="h3">If you are not happy</h2>
  <p>You can complain to the Spanish data protection authority, the Agencia Española de Protección de Datos, at <a href="https://www.aepd.es">www.aepd.es</a>.</p>

  <p><a class="btn btn-second" href="/">Back to home</a></p>
</main>
${footer(contact)}`,
  });
}

export function siteNotFoundPage({ contact = '' } = {}) {
  return layout({
    title: 'Page not found · project1',
    noindex: true,
    body: `${topBar({ withButton: false })}
<main class="page">
  <h1 class="h1">This page does not exist.</h1>
  <p class="lead">The link may be old or mistyped.</p>
  <a class="btn" href="/">Back to home</a>
</main>
${footer(contact)}`,
  });
}
