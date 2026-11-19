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

export function createNotifier({
  to, from, smtpUrl, resendApiKey, publicUrl = '', transport, fetchFn = fetch,
}) {
  if (!to) return null;

  let send;
  if (transport) {
    send = (message) => transport.sendMail(message);
  } else if (resendApiKey) {
    send = (message) => sendWithResend(resendApiKey, message, fetchFn);
  } else if (smtpUrl) {
    const mailer = nodemailer.createTransport(smtpUrl, { connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
    send = (message) => mailer.sendMail(message);
  } else {
    return null;
  }

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

export const notifierMode = ({ resendApiKey, smtpUrl }) => (resendApiKey ? 'Resend (HTTPS)' : smtpUrl ? 'SMTP' : 'none');
