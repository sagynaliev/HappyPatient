import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendRegistrationConfirmation } from './registrationNotification';

describe('registration confirmation notification', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records a local confirmation without exposing credentials', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await sendRegistrationConfirmation('patient@example.test', 'Taylor');
    expect(result.channel).toBe('local');
    expect(result.message).toContain('recorded for local development');
    expect(log).toHaveBeenCalledWith('Registration confirmation notification recorded for local development.');
    expect(JSON.stringify(result)).not.toMatch(/password|token|secret/i);
  });
});