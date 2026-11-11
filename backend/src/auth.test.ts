import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';

let auth: typeof import('./auth');
let rateLimit: (typeof import('./rateLimit'))['rateLimit'];
beforeAll(async () => {
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';
  process.env.JWT_SECRET ||= 'test-secret-with-at-least-16-chars';
  auth = await import('./auth.js');
  ({ rateLimit } = await import('./rateLimit.js'));
});

describe('password hashing', () => {
  it('hashes with scrypt, salts every hash and verifies only the right password', async () => {
    const first = await auth.hashPassword('Correct horse 1!');
    const second = await auth.hashPassword('Correct horse 1!');
    expect(first.startsWith('scrypt$')).toBe(true);
    expect(first).not.toBe(second);
    expect(auth.isLegacyHash(first)).toBe(false);
    expect(await auth.comparePassword('Correct horse 1!', first)).toBe(true);
    expect(await auth.comparePassword('correct horse 1!', first)).toBe(false);
  });
  it('still accepts bcrypt hashes stored before the switch and marks them for upgrade', async () => {
    const legacy = await bcrypt.hash('Demo@12345', 4);
    expect(auth.isLegacyHash(legacy)).toBe(true);
    expect(await auth.comparePassword('Demo@12345', legacy)).toBe(true);
    expect(await auth.comparePassword('wrong', legacy)).toBe(false);
  });
  it('rejects a damaged hash instead of throwing', async () => {
    expect(await auth.comparePassword('anything', 'scrypt$only-a-salt')).toBe(false);
  });
});

describe('request limiter', () => {
  it('allows the configured number of attempts per key, then answers 429 with Retry-After', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', rateLimit({ windowMs: 60_000, max: 2, key: (req) => String(req.body?.email ?? '') }), (_req, res) => res.json({ ok: true }));
    const attempt = (email: string) => request(app).post('/login').send({ email });
    expect((await attempt('a@example.test')).status).toBe(200);
    expect((await attempt('a@example.test')).status).toBe(200);
    const blocked = await attempt('a@example.test');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Another account from the same address is counted separately.
    expect((await attempt('b@example.test')).status).toBe(200);
  });
});
