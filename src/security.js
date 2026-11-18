import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const OPTS = { N: 16384, r: 8, p: 1 };

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, OPTS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, OPTS);
  return crypto.timingSafeEqual(expected, actual);
}

// Used when the email is unknown, so a wrong email takes as long as a wrong password.
let dummy;
export async function dummyHash() {
  dummy ??= await hashPassword('not-a-real-password-for-timing-only');
  return dummy;
}

export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Simple in-memory limiter: at most `max` hits per `windowMs` for each key.
export function createLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    take(key) {
      const now = Date.now();
      const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
