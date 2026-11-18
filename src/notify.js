import nodemailer from 'nodemailer';

// One email to Luis for each new enquiry. Off until NOTIFY_EMAIL and SMTP_URL are set.
// The visitor never waits for it and never sees a failure: the enquiry is already saved.

const oneLine = (text) => String(text ?? '').replace(/[\r\n]+/g, ' ').trim();

export function createNotifier({ to, from, smtpUrl, publicUrl = '', transport }) {
  if (!to || (!smtpUrl && !transport)) return null;
  const mailer = transport ?? nodemailer.createTransport(smtpUrl);
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
    await mailer.sendMail({
      from: from || to,
      to,
      replyTo: { name: oneLine(name).replace(/[<>"]/g, ''), address: email },
      subject: `New enquiry: ${oneLine(name).slice(0, 80)}`,
      text: lines.join('\n'),
    });
  };
}
