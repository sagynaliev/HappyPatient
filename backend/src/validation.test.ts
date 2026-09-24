import { describe, expect, it } from 'vitest';
import { registrationSchema } from './validation';

describe('registration validation', () => {
  it('normalizes email', () => expect(registrationSchema.parse({ email: 'USER@Example.COM', password: 'password123', firstName: 'A', lastName: 'B', iin: '123456789012' }).email).toBe('user@example.com'));
  it('rejects short passwords', () => expect(() => registrationSchema.parse({ email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B', iin: '123456789012' })).toThrow());
  it('requires an IIN with exactly 12 digits', () => {
    const base = { email: 'a@b.com', password: 'password123', firstName: 'A', lastName: 'B' };
    expect(registrationSchema.parse({ ...base, iin: '123456789012' }).iin).toBe('123456789012');
    expect(() => registrationSchema.parse({ ...base, iin: '12345678901' })).toThrow();
    expect(() => registrationSchema.parse({ ...base, iin: '12345678901a' })).toThrow();
  });
});
