import { describe, expect, it } from 'vitest';
import { registrationSchema } from './validation';

describe('registration validation', () => {
  it('normalizes email', () => expect(registrationSchema.parse({ email: 'USER@Example.COM', password: 'password123', firstName: 'A', lastName: 'B' }).email).toBe('user@example.com'));
  it('rejects short passwords', () => expect(() => registrationSchema.parse({ email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B' })).toThrow());
});
