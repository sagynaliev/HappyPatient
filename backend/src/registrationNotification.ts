import { Resend } from 'resend';

export type RegistrationNotification = {
  channel: 'email' | 'local';
  message: string;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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
  const safeName = escapeHtml(firstName);
  const destination = getFrontendUrl(frontendUrl);
  const cta = destination
    ? `<tr><td align="center" style="padding:8px 0 32px;"><a href="${escapeHtml(destination)}" style="display:inline-block;background-color:#087f8c;border-radius:8px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;padding:15px 28px;text-decoration:none;">Go to HappyPatient</a></td></tr>`
    : '';
  const textCta = destination ? `\nGo to HappyPatient: ${destination}\n` : '';
  const year = new Date().getFullYear();

  return {
    subject: 'Welcome to HappyPatient!',
    text: `Hello ${firstName},\n\nWelcome to HappyPatient!\n\nYour account has been successfully created. You can now explore our platform, find doctors, view their schedules, and manage your appointments.\n\nAvailable on HappyPatient:\n- Search for doctors and specialists.\n- View doctors' schedules.\n- Book and manage appointments.\n- Receive important notifications.\n${textCta}\nThank you for choosing HappyPatient. We are happy to have you with us!\n\nBest regards,\nThe HappyPatient Team\n\n© ${year} HappyPatient`,
    html: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><title>Welcome to HappyPatient!</title></head>
  <body style="margin:0;padding:0;background-color:#f3f6f8;color:#19313a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f6f8;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e3eaed;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:28px 36px;background-color:#ffffff;border-bottom:1px solid #edf1f3;">
            <div style="color:#087f8c;font-size:20px;font-weight:bold;letter-spacing:-0.3px;">&#10010; HappyPatient</div>
          </td></tr>
          <tr><td style="padding:36px 36px 12px;">
            <p style="margin:0 0 20px;color:#19313a;font-size:16px;line-height:25px;">Hello ${safeName},</p>
            <h1 style="margin:0 0 16px;color:#173943;font-size:28px;line-height:36px;font-weight:700;">Welcome to HappyPatient!</h1>
            <p style="margin:0 0 16px;color:#52666d;font-size:16px;line-height:26px;">Your account has been successfully created. You can now explore our platform, find doctors, view their schedules, and manage your appointments.</p>
            <p style="margin:0 0 12px;color:#19313a;font-size:16px;line-height:24px;font-weight:bold;">With HappyPatient, you can:</p>
            <ul style="margin:0 0 22px;padding-left:22px;color:#52666d;font-size:15px;line-height:27px;">
              <li>Search for doctors and specialists.</li>
              <li>View doctors' schedules.</li>
              <li>Book and manage appointments.</li>
              <li>Receive important notifications.</li>
            </ul>
            <p style="margin:0 0 26px;color:#52666d;font-size:16px;line-height:26px;">Thank you for choosing HappyPatient. We are happy to have you with us!</p>
            <p style="margin:0 0 24px;color:#52666d;font-size:15px;line-height:24px;">Best regards,<br><strong style="color:#19313a;">The HappyPatient Team</strong></p>
          </td></tr>
          ${cta}
          <tr><td align="center" style="padding:20px 28px;background-color:#f8fafb;border-top:1px solid #edf1f3;">
            <p style="margin:0 0 6px;color:#087f8c;font-size:14px;font-weight:bold;">HappyPatient</p>
            <p style="margin:0;color:#829198;font-size:12px;line-height:18px;">© ${year} HappyPatient. All rights reserved.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
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
