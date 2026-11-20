import { esc } from './views.js';

// The text on these pages is the draft in the Copy page in project1 HQ.
// Each block is marked there as Ready, Draft or Blocked. Change the text there first.

const LINE =
  'project1 is being built for students who came from abroad to study at a university in Barcelona. Join the waiting list and tell us what is hardest.';
const DESCRIPTION =
  'project1 is being built for students who came from abroad to study at a university in Barcelona. Join the waiting list.';
const QUESTIONS = ['How does grading work?', 'What if I fail?', 'How do I enrol?', 'How do I study here?'];

const FAQ = [
  ['What is project1?', 'We are building help for students who came from abroad to study in Spain. We are at the start, so we are talking to students first.'],
  ['Does joining cost anything?', 'No. This website takes no payments.'],
  ['What will it cost later?', 'We have not set a price yet.'],
  ['What happens after I join?', 'We read your answer and may write to you.'],
  ['Who sees my details?', 'Only the founder of project1 can open the list.'],
  ['Can I ask you to delete my details?', 'Yes. Write to us and we delete them.'],
];

function contactLink(email) {
  return email
    ? `<a href="mailto:${esc(email)}">${esc(email)}</a>`
    : '<span>[contact email to be added]</span>';
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=DM+Sans:wght@400;600&display=swap">
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
    <p class="small on-dark-soft">We use your name, email and answer to contact you about project1. Only the founder can see them, and you can ask us to delete them at any time.</p>
    <p><a href="/privacy">Privacy</a></p>
  </div>
</footer>`;
}

function fieldError(errors, key) {
  return errors[key] ? `<p class="error" id="${key}-error" role="alert">${esc(errors[key])}</p>` : '';
}

function joinForm({ values, errors }) {
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
    <button class="btn" type="submit">Join the waiting list</button>
  </form>`;
}

export function homePage({ values = {}, errors = {}, contact = '' } = {}) {
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
  <p class="kicker"><span class="tag">What you get</span></p>
  <h2 class="h2">What you get by joining</h2>
  <div class="cards">
    <article class="card card-main"><h3 class="h3">A place on the waiting list.</h3></article>
    <article class="card"><h3 class="h3">A say in what we build.</h3><p>You tell us what is hardest, and we read it.</p></article>
    <article class="card card-accent"><h3 class="h3">A first look.</h3><p>When there is something to try, you hear first.</p></article>
  </div>
</section>

<section class="section">
  <p class="kicker"><span class="tag">How it works</span></p>
  <h2 class="h2">Three steps</h2>
  <ol class="steps">
    <li class="card"><span class="big">1</span><p>Leave your name, email and one answer. It takes a minute.</p></li>
    <li class="card"><span class="big">2</span><p>We read it and may write to you.</p></li>
    <li class="card"><span class="big">3</span><p>When there is something to try, we invite you.</p></li>
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
    <h2 class="h2">Tell us what is hardest.</h2>
    <p class="lead">Join the waiting list. It takes a minute.</p>
    ${hasErrors ? '<p class="notice" role="alert">Something is missing. Nothing you typed is lost.</p>' : ''}
  </div>
  ${joinForm({ values, errors })}
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

export function privacyPage({ contact = '' } = {}) {
  return layout({
    title: 'Privacy · project1',
    body: `${topBar({ withButton: false })}
<main class="page">
  <h1 class="h1">Privacy</h1>
  <h2 class="h3">What we collect</h2>
  <p>Your name, your email and your answer to one question, and your agreement to be contacted.</p>
  <h2 class="h3">Why</h2>
  <p>To contact you about project1 and to learn what students find hardest.</p>
  <h2 class="h3">Who sees it</h2>
  <p>Only the founder of project1.</p>
  <h2 class="h3">How to ask for deletion</h2>
  <p>Write to ${contactLink(contact)} and we delete your details.</p>
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
