export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const trust = env.TRUST_PROXY;
  return {
    port: Number(env.PORT) || 3000,
    databasePath: env.DATABASE_PATH || './data/project1.db',
    production,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    trustProxy: trust ? (Number.isNaN(Number(trust)) ? trust : Number(trust)) : false,
    allowedOrigin: env.ALLOWED_ORIGIN || '',
    allowIndexing: env.ALLOW_INDEXING === 'true',
    contactEmail: (env.CONTACT_EMAIL || '').trim(),
    publicUrl: (env.PUBLIC_URL || '').trim(),
    notifyEmail: (env.NOTIFY_EMAIL || '').trim(),
    mailFrom: (env.MAIL_FROM || '').trim(),
    smtpUrl: (env.SMTP_URL || '').trim(),
    sessionDays: Number(env.SESSION_DAYS) || 7,
    adminEmail: (env.ADMIN_EMAIL || '').trim(),
    adminPassword: env.ADMIN_PASSWORD || '',
  };
}
