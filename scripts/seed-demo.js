// Development only: adds clearly marked TEST enquiries so the admin screens are not empty.
// Refuses to run in production. Nothing here is real data.
import { loadConfig } from '../src/config.js';
import { makeRepo, openDb } from '../src/db.js';

const config = loadConfig();
if (config.production) {
  console.error('Refusing to add test data in production.');
  process.exit(1);
}
const db = openDb(config.databasePath);
const repo = makeRepo(db);

const samples = [
  { name: '[TEST] Student one', email: 'test-one@example.invalid', answer: '[TEST] Placeholder answer, not a real student.', status: 'Lead' },
  { name: '[TEST] Student two', email: 'test-two@example.invalid', answer: '', status: 'Contacted', note: '[TEST] Placeholder note.' },
  { name: '[TEST] Student three', email: 'test-three@example.invalid', answer: '[TEST] Another placeholder answer.', status: 'Call booked' },
];
for (const s of samples) {
  const { id, duplicate } = repo.createEnquiry(s);
  if (!duplicate) {
    repo.setStatus(id, s.status);
    if (s.note) repo.addNote(id, s.note);
  }
}
db.close();
console.log(`TEST enquiries ready in ${config.databasePath}.`);
