import { createApp, bootstrapAdmin } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.databasePath);

if (await bootstrapAdmin(db, config)) console.log('Admin created from ADMIN_EMAIL and ADMIN_PASSWORD.');

const app = createApp({ db, config });
const server = app.listen(config.port, () => {
  console.log(`project1 admin listening on port ${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
