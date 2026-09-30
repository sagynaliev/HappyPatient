import { Resend } from 'resend';

export type RegistrationNotification = {
  channel: 'email' | 'local';
  message: string;
};

export async function sendRegistrationConfirmation(email: string, firstName: string, apiKey?: string): Promise<RegistrationNotification> {
  if (!apiKey) {
    console.info('Registration confirmation notification recorded for local development.');
    return { channel: 'local', message: 'Confirmation notification recorded for local development.' };
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Welcome to HappyPatient',
      text: `Hello ${firstName},\n\nYour HappyPatient account was created successfully.`,
    });
    if (!error) return { channel: 'email', message: 'A confirmation email has been sent.' };
    console.error('Resend rejected registration confirmation email', { statusCode: error.statusCode, name: error.name });
  } catch (error: unknown) {
    console.error('Registration confirmation email could not be sent', { name: error instanceof Error ? error.name : undefined });
  }

  console.info('Registration confirmation notification recorded for local development.');
  return { channel: 'local', message: 'Account created; confirmation notification recorded locally because email delivery was unavailable.' };
}