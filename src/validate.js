// The wording of the messages matches the Copy page in project1 HQ.
const clean = (value) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRUE_VALUES = new Set(['true', 'on', '1', 'yes']);

export function validateEnquiry(body = {}) {
  const errors = {};
  const name = clean(body.name).replace(/\s+/g, ' ');
  const email = clean(body.email);
  const answer = clean(body.answer);
  const consent = body.consent === true || TRUE_VALUES.has(String(body.consent).toLowerCase());

  if (!name) errors.name = 'Please tell us your name.';
  else if (name.length > 120) errors.name = 'Please use a shorter name.';

  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Please check your email address.';

  if (answer.length > 2000) errors.answer = 'Please keep your answer under 2000 characters.';

  if (!consent) errors.consent = 'Please tick the box so we can write to you.';

  return { errors, value: { name, email, answer } };
}

export function validateNote(body = {}) {
  const text = clean(body.note);
  if (!text) return { error: 'Please write a note first.' };
  if (text.length > 2000) return { error: 'Please keep the note under 2000 characters.' };
  return { value: text };
}
