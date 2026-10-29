import { brandedEmail } from './email/layout';
import { Resend } from 'resend';

export type RegistrationNotification = {
  channel: 'email' | 'local';
  message: string;
};

function getFrontendUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.username = '';
    url.password = '';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function createRegistrationEmail(firstName: string, frontendUrl?: string) {
  const destination = getFrontendUrl(frontendUrl);
  const content = brandedEmail({
    title: 'Welcome to HappyPatient!',
    action: destination ? { label: 'Go to HappyPatient', url: destination } : undefined,
    message: `Hello ${firstName},\n\nYour account has been successfully created.\n\nSearch for doctors and specialists.\nView doctors' schedules.\nBook and manage appointments.\nReceive important notifications.`,
    nextStep: 'Thank you for choosing HappyPatient. We are happy to have you with us!',
  });
  return { subject: 'Welcome to HappyPatient!', ...content };
}

export async function sendRegistrationConfirmation(
  email: string,
  firstName: string,
  apiKey?: string,
  frontendUrl?: string,
): Promise<RegistrationNotification> {
  if (!apiKey) {
    console.info('Registration confirmation notification recorded for local development.');
    return { channel: 'local', message: 'Email was not sent; a local development confirmation was logged.' };
  }

  const message = createRegistrationEmail(firstName, frontendUrl);
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      ...message,
    });
    if (!error) return { channel: 'email', message: 'Confirmation email accepted by the email provider for delivery.' };
    console.error('Resend rejected registration confirmation email', { statusCode: error.statusCode, name: error.name });
  } catch (error: unknown) {
    console.error('Registration confirmation email could not be sent', { name: error instanceof Error ? error.name : undefined });
  }

  console.info('Registration confirmation notification recorded for local development.');
  return { channel: 'local', message: 'Email was not sent; a local development fallback was logged because email delivery was unavailable.' };
}
