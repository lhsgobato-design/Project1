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
    // Who is responsible for the data (shown on the Privacy page and next to the form).
    controllerName: (env.CONTROLLER_NAME || '').trim(),
    controllerAddress: (env.CONTROLLER_ADDRESS || '').trim(),
    controllerTaxId: (env.CONTROLLER_TAX_ID || '').trim(),
    retention: (env.RETENTION_PERIOD || '').trim(),
    publicUrl: (env.PUBLIC_URL || '').trim(),
    notifyEmail: (env.NOTIFY_EMAIL || '').trim(),
    mailFrom: (env.MAIL_FROM || '').trim(),
    smtpUrl: (env.SMTP_URL || '').trim(),
    resendApiKey: (env.RESEND_API_KEY || '').trim(),
    sessionDays: Number(env.SESSION_DAYS) || 7,
    adminEmail: (env.ADMIN_EMAIL || '').trim(),
    adminPassword: env.ADMIN_PASSWORD || '',
    adminReset: env.ADMIN_RESET === 'true',
    // Read-only API for the AI agent. Only the SHA-256 of the agent's key is stored here,
    // never the key itself. Empty = the agent API is off (every /api/agent path answers 404).
    agentReadTokenHash: (env.AGENT_READ_TOKEN_SHA256 || '').trim().toLowerCase(),
  };
}
