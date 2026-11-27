import nodemailer from 'nodemailer';

// One email to the owner for each new enquiry. Off until NOTIFY_EMAIL and a way to send are set.
// Two ways to send:
//   RESEND_API_KEY  sends over HTTPS (works on every host, including Railway's Free, Trial and Hobby plans,
//                   which block SMTP).
//   SMTP_URL        plain SMTP (works where the host allows outgoing SMTP).
// The visitor never waits for it and never sees a failure: the enquiry is already saved.

const oneLine = (text) => String(text ?? '').replace(/[\r\n]+/g, ' ').trim();

async function sendWithResend(apiKey, message, fetchFn) {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo.address,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const error = new Error(`Resend answered ${res.status}`);
    error.code = `RESEND_${res.status}`;
    throw error;
  }
}

// The way to send, shared by the owner notice and the acceptance email. null when none is set.
function makeSend({ smtpUrl, resendApiKey, transport, fetchFn }) {
  if (transport) return (message) => transport.sendMail(message);
  if (resendApiKey) return (message) => sendWithResend(resendApiKey, message, fetchFn);
  if (smtpUrl) {
    const mailer = nodemailer.createTransport(smtpUrl, { connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
    return (message) => mailer.sendMail(message);
  }
  return null;
}

export function createNotifier({
  to, from, smtpUrl, resendApiKey, publicUrl = '', transport, fetchFn = fetch,
}) {
  if (!to) return null;

  const send = makeSend({ smtpUrl, resendApiKey, transport, fetchFn });
  if (!send) return null;

  // Resend's shared sender can only write to the address the Resend account was made with,
  // which is the case here: the notice goes to the owner.
  const sender = from || (resendApiKey && !transport ? 'project1 <onboarding@resend.dev>' : to);
  const base = publicUrl.replace(/\/+$/, '');

  return async function notify({ id, name, email, answer }) {
    const link = base ? `${base}/admin/enquiries/${id}` : '';
    const lines = [
      'New enquiry on the project1 waiting list.',
      '',
      `Name: ${oneLine(name)}`,
      `Email: ${oneLine(email)}`,
      `Answer: ${answer ? answer : '(no answer given)'}`,
      ...(link ? ['', `Open it: ${link}`] : []),
      '',
      'Reply to this email to write to the student.',
    ];
    await send({
      from: sender,
      to,
      replyTo: { name: oneLine(name).replace(/[<>"]/g, ''), address: email },
      subject: `New enquiry: ${oneLine(name).slice(0, 80)}`,
      text: lines.join('\n'),
    });
  };
}

// ---------- Acceptance email to the student ----------
// Sent from the admin with a button, when an enquiry is in Pilot. The text is a draft: change it here.
export const ACCEPTANCE_SUBJECT = "You're invited to try project1";

export function acceptanceText(name) {
  return [
    `Hi ${oneLine(name)},`,
    '',
    "Good news: you're one of the first students invited to try project1.",
    '',
    'project1 helps students who came from abroad understand how grading, classes and schedules work at a university in Barcelona.',
    '',
    "We'll write to you again soon with how to start. If you have a question before then, just reply to this email.",
    '',
    'The project1 team',
    '',
    '--',
    'You get this email because you joined the project1 waiting list. To have your details deleted, reply and ask us.',
  ].join('\n');
}

// Returns { enabled, reason, send }. Writing to students needs MAIL_FROM on a domain verified with
// the sending service: Resend's shared sender (onboarding@resend.dev) can only write to the account owner.
export function createAcceptanceMailer({
  from, replyTo, smtpUrl, resendApiKey, transport, fetchFn = fetch,
}) {
  const send = makeSend({ smtpUrl, resendApiKey, transport, fetchFn });
  if (!send) return { enabled: false, reason: 'Sending to students is off: no way to send email is set (RESEND_API_KEY or SMTP_URL).' };
  if (!from || /@resend\.dev>?\s*$/i.test(from)) {
    return { enabled: false, reason: 'Sending to students is off until MAIL_FROM is set to an address on your own domain, verified in Resend.' };
  }
  return {
    enabled: true,
    reason: '',
    async send({ name, email }) {
      await send({
        from,
        to: email,
        replyTo: { name: 'project1', address: replyTo || from.replace(/^.*<([^>]+)>.*$/, '$1') },
        subject: ACCEPTANCE_SUBJECT,
        text: acceptanceText(name),
      });
    },
  };
}

export const notifierMode = ({ resendApiKey, smtpUrl }) => (resendApiKey ? 'Resend (HTTPS)' : smtpUrl ? 'SMTP' : 'none');
