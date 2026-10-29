import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
    constructor(_apiKey: string) {}
  },
}));

import { sendRegistrationConfirmation } from './registrationNotification';

describe('registration confirmation notification', () => {
  beforeEach(() => sendEmail.mockReset().mockResolvedValue({ error: null }));
  afterEach(() => vi.restoreAllMocks());

  it('sends a personalized HTML email and matching text fallback through the mocked provider', async () => {
    const firstName = 'Amina';
    const frontendUrl = 'https://app.example.test';
    const result = await sendRegistrationConfirmation('patient@example.test', firstName, 'test-resend-key', frontendUrl);

    expect(result.channel).toBe('email');
    expect(result.message).toContain('accepted by the email provider');
    expect(sendEmail).toHaveBeenCalledOnce();
    const [payload] = sendEmail.mock.calls[0];
    expect(payload).toMatchObject({
      from: 'onboarding@resend.dev',
      to: 'patient@example.test',
      subject: 'Welcome to HappyPatient!',
    });
    expect(payload.html).toContain('Hello Amina,');
    expect(payload.html).toContain('Your account has been successfully created.');
    expect(payload.html).toContain('Search for doctors and specialists.');
    expect(payload.html).toContain("View doctors&#39; schedules.");
    expect(payload.html).toContain('Book and manage appointments.');
    expect(payload.html).toContain('Receive important notifications.');
    expect(payload.html).toContain('href="https://app.example.test/"');
    expect(payload.html).toContain('Go to HappyPatient');
    expect(payload.html).toContain('©');
    expect(payload.text).toContain('Hello Amina,');
    expect(payload.text).toContain('View doctors\' schedules.');
    expect(payload.text).toContain('Go to HappyPatient: https://app.example.test/');
  });

  it('escapes first names and does not insert unsafe frontend URLs into a link', async () => {
    await sendRegistrationConfirmation('patient@example.test', '<img src=x onerror=alert(1)>', 'test-resend-key', 'javascript:alert(1)');

    const [payload] = sendEmail.mock.calls[0];
    expect(payload.html).toContain('Hello &lt;img src=x onerror=alert(1)&gt;,');
    expect(payload.html).not.toContain('<img src=x');
    expect(payload.html).not.toContain('href="javascript:');
    expect(payload.html).not.toContain('Go to HappyPatient</a>');
    expect(payload.text).toContain('Hello <img src=x onerror=alert(1)>,');
  });

  it('does not send an email when RESEND_API_KEY is missing', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await sendRegistrationConfirmation('patient@example.test', 'Taylor');

    expect(result.channel).toBe('local');
    expect(result.message).toContain('Email was not sent');
    expect(result.message).toContain('logged');
    expect(log).toHaveBeenCalledWith('Registration confirmation notification recorded for local development.');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/password|token|secret/i);
  });

  it('omits the CTA link safely when FRONTEND_URL is missing', async () => {
    await sendRegistrationConfirmation('patient@example.test', 'Taylor', 'test-resend-key');

    const [payload] = sendEmail.mock.calls[0];
    expect(payload.html).not.toContain('href=');
    expect(payload.text).not.toContain('Go to HappyPatient:');
    expect(payload.html).toContain('Your account has been successfully created.');
  });

  it('reports provider rejection without claiming that an email was sent', async () => {
    sendEmail.mockResolvedValue({ error: { statusCode: 422, name: 'validation_error' } });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await sendRegistrationConfirmation('patient@example.test', 'Taylor', 'test-resend-key', 'https://app.example.test');

    expect(result.channel).toBe('local');
    expect(result.message).toContain('Email was not sent');
    expect(result.message).toContain('logged');
    expect(result.message).not.toMatch(/email has been sent/i);
    expect(errorLog).toHaveBeenCalledWith('Resend rejected registration confirmation email', { statusCode: 422, name: 'validation_error' });
    expect(infoLog).toHaveBeenCalledWith('Registration confirmation notification recorded for local development.');
  });

  it('handles provider request failures without logging patient content or credentials', async () => {
    sendEmail.mockRejectedValue(new Error('network failure'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoLog = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await sendRegistrationConfirmation('patient@example.test', 'Taylor', 'test-resend-key');

    expect(result.channel).toBe('local');
    expect(result.message).toContain('Email was not sent');
    expect(result.message).toContain('logged');
    expect(errorLog).toHaveBeenCalledWith('Registration confirmation email could not be sent', { name: 'Error' });
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/patient@example\.test|test-resend-key|Taylor/);
    expect(infoLog).toHaveBeenCalledWith('Registration confirmation notification recorded for local development.');
  });
});
