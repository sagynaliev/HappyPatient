import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { config } from './config';

export type AuthUser = { id: string; email: string; role: Role };

// Passwords are hashed with scrypt, which runs on Node's thread pool. bcryptjs is pure JavaScript and held
// the single request thread for ~0.2–0.5 s per login, so a burst of sign-ins stalled every other request.
// N=2^14, r=8, p=5 is the OWASP-recommended low-memory setting (16 MB per hash).
const SCRYPT = { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const scrypt = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT, (error, key) => (error ? reject(error) : resolve(key))));

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scrypt(password, salt)).toString('base64')}`;
}
/** Hashes written before the switch are bcrypt; they still verify and are upgraded at the next sign-in. */
export const isLegacyHash = (hash: string) => !hash.startsWith('scrypt$');
// bcryptjs holds the request thread while it works. Old hashes are checked one at a time with a pause in
// between, so other requests are served between checks instead of waiting for a whole burst of sign-ins.
let legacyQueue: Promise<unknown> = Promise.resolve();
function compareLegacy(password: string, hash: string) {
  const result = legacyQueue.then(() => new Promise((resolve) => setImmediate(resolve))).then(() => bcrypt.compare(password, hash));
  legacyQueue = result.catch(() => undefined);
  return result;
}
export async function comparePassword(password: string, hash: string) {
  if (isLegacyHash(hash)) return compareLegacy(password, hash);
  const [, salt, key] = hash.split('$');
  if (!salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
export const signToken = (user: AuthUser) => jwt.sign(user, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
export const verifyToken = (token: string) => jwt.verify(token, config.JWT_SECRET) as AuthUser;
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const randomVerificationCode = () => crypto.randomInt(100000, 1000000).toString();
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
