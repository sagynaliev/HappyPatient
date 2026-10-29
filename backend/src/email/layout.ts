export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export type EmailContent = { title: string; message: string; details?: Array<[string, string]>; nextStep?: string; tone?: 'success' | 'neutral' | 'blue'; action?: { label: string; url: string } };

/** Tables and inline styles remain usable when clients strip stylesheets or media queries. */
export function brandedEmail(content: EmailContent) {
  const { title, message, details = [], nextStep = '', tone = 'blue' } = content;
  const action = content.action && /^https?:\/\//i.test(content.action.url) ? content.action : undefined;
  const color = tone === 'success' ? '#15803D' : tone === 'neutral' ? '#64748B' : '#2D5FF5';
  const icon = tone === 'neutral' ? '&#8212;' : '&#10003;';
  const rows = details.map(([label, value]) => `<tr><td style="padding:12px 16px;color:#64748B;vertical-align:top;width:35%;border-bottom:1px solid #E3E9FA;">${escapeHtml(label)}</td><td style="padding:12px 16px;color:#111D40;font-weight:bold;overflow-wrap:anywhere;border-bottom:1px solid #E3E9FA;">${escapeHtml(value)}</td></tr>`).join('');
  return {
    text: `${title}\n\n${message}${details.length ? '\n\n' + details.map(([label, value]) => `${label}: ${value}`).join('\n') : ''}${nextStep ? '\n\n' + nextStep : ''}${action ? `\n${action.label}: ${action.url}` : ''}\n\nHappy Patient | Your care, connected.`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#F3F6FF;font-family:Arial,Helvetica,sans-serif;color:#111D40;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F6FF;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E3E9FA;border-radius:20px;">
<tr><td style="padding:24px;border-bottom:1px solid #E3E9FA;color:#2D5FF5;font-size:23px;font-weight:bold;">&#10010; HappyPatient</td></tr>
<tr><td style="padding:32px 24px 24px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" width="48" height="48" style="background-color:#F3F6FF;border-radius:24px;color:${color};font-size:28px;font-weight:bold;">${icon}</td></tr></table>
<h1 style="margin:20px 0 12px;font-size:26px;line-height:34px;color:#111D40;">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#52607C;white-space:pre-line;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F6FF;border-radius:12px;font-size:14px;line-height:22px;table-layout:fixed;">${rows}</table>` : ''}
${action ? `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 24px;background-color:#2D5FF5;border-radius:8px;color:#FFFFFF;font-weight:bold;text-decoration:none;">${escapeHtml(action.label)}</a></p>` : ''}
${nextStep ? `<p style="margin:24px 0 0;font-size:15px;line-height:25px;color:#52607C;">${escapeHtml(nextStep)}</p>` : ''}</td></tr>
<tr><td align="center" style="padding:24px;border-top:1px solid #E3E9FA;color:#64748B;font-size:12px;line-height:20px;"><strong style="color:#2D5FF5;">Happy Patient</strong><br>Your care, connected.<br>© HappyPatient. This is an automated notification from Happy Patient.</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  };
}
