export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const DEFAULT_PLATFORM_URL = 'https://happypatient-f.onrender.com';
/** Public address of the web app. FRONTEND_URL wins when set; otherwise the deployed site is used so every email carries a link. */
export function platformUrl(configured?: string) {
  const value = (configured || process.env.FRONTEND_URL || '').trim();
  return /^https?:\/\//i.test(value) ? value.replace(/\/+$/, '') : DEFAULT_PLATFORM_URL;
}

/**
 * Tone follows colour meaning so a glance tells the patient what happened:
 * success = done (green), danger = cancelled (red), warning = needs attention (amber),
 * info = reminder or update (platform blue). 'blue' and 'neutral' are kept as older names for info.
 */
export type EmailTone = 'success' | 'danger' | 'warning' | 'info' | 'blue' | 'neutral';
export type EmailVisit = { startAt: Date; endAt?: Date; doctor: string; office?: string | null };
export type EmailStep = { title: string; text: string };
export type EmailContent = {
  title: string; message: string; details?: Array<[string, string]>; nextStep?: string; steps?: EmailStep[]; tone?: EmailTone;
  action?: { label: string; url: string }; secondary?: { label: string; url: string }; status?: string; visit?: EmailVisit; code?: string;
};

// Platform tokens (frontend global.css / patientDashboard.css) so emails look like the app.
const C = { primary: '#2B63F6', deep: '#1A3FAE', ink: '#101B3B', muted: '#5A6687', border: '#E1E7F3', page: '#F2F5FC', soft: '#F6F8FF', accent: '#E9EFFF' };
const tones = {
  success: { color: '#0F8A63', pillBg: '#E3F7EE', pillText: '#0F7A57', icon: '&#10003;', label: 'Done' },
  danger: { color: '#D63B42', pillBg: '#FDECEC', pillText: '#B42318', icon: '&#10005;', label: 'Cancelled' },
  warning: { color: '#E08A12', pillBg: '#FDF3E6', pillText: '#B45309', icon: '!', label: 'Attention' },
  info: { color: '#FFFFFF', pillBg: C.accent, pillText: C.deep, icon: 'i', label: 'Update' },
} as const;
const toneOf = (tone: EmailTone = 'info') => tones[tone === 'blue' || tone === 'neutral' ? 'info' : tone];
const FONT = "'Onest','Segoe UI',Roboto,Arial,Helvetica,sans-serif";
const almaty = (value: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', ...options }).format(value);
const clock = (value: Date) => almaty(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Same shape as the dashboard "Upcoming appointment" card: date tile, doctor, time, office and a status pill. */
function visitCard(visit: EmailVisit, tone: ReturnType<typeof toneOf>, status: string, cancelled: boolean) {
  const time = `${clock(visit.startAt)}${visit.endAt ? `–${clock(visit.endAt)}` : ''}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.soft};border-radius:20px;">
<tr><td width="82" valign="middle" style="padding:18px 0 18px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="64" style="width:64px;padding:10px 0;background-color:${cancelled ? '#A3ACC2' : C.primary};border-radius:16px;color:#FFFFFF;font-family:${FONT};">
<div style="font-size:12px;line-height:16px;">${escapeHtml(almaty(visit.startAt, { month: 'short' }))}</div><div style="font-size:26px;line-height:30px;font-weight:bold;">${escapeHtml(almaty(visit.startAt, { day: 'numeric' }))}</div></td></tr></table></td>
<td valign="middle" style="padding:18px 18px 18px 14px;font-family:${FONT};">
<span style="display:inline-block;margin-bottom:6px;padding:4px 10px;background-color:${tone.pillBg};border-radius:999px;color:${tone.pillText};font-size:12px;font-weight:bold;">${escapeHtml(status)}</span>
<div style="font-size:17px;line-height:24px;font-weight:bold;color:${C.ink};overflow-wrap:anywhere;${cancelled ? 'text-decoration:line-through;text-decoration-color:#A3ACC2;' : ''}">${escapeHtml(visit.doctor)}</div>
<div style="margin-top:3px;font-size:14px;line-height:21px;color:${C.muted};">${escapeHtml(almaty(visit.startAt, { weekday: 'long', day: 'numeric', month: 'long' }))} · <strong style="color:${C.ink};">${escapeHtml(time)}</strong></div>
${visit.office ? `<div style="margin-top:1px;font-size:14px;line-height:21px;color:${C.muted};overflow-wrap:anywhere;">${escapeHtml(visit.office)} · Asia/Almaty</div>` : `<div style="margin-top:1px;font-size:14px;line-height:21px;color:${C.muted};">Asia/Almaty</div>`}
</td></td></tr></table>`;
}

function stepsList(steps: EmailStep[]) {
  return steps.map((step, index) => `<tr><td width="44" valign="top" style="padding:0 0 ${index === steps.length - 1 ? 0 : 16}px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" style="width:32px;height:32px;background-color:${C.accent};border-radius:16px;color:${C.primary};font-family:${FONT};font-size:14px;font-weight:bold;line-height:32px;">${index + 1}</td></tr></table></td>
<td valign="top" style="padding:4px 0 ${index === steps.length - 1 ? 0 : 16}px;font-family:${FONT};"><div style="font-size:15px;line-height:22px;font-weight:bold;color:${C.ink};">${escapeHtml(step.title)}</div><div style="margin-top:2px;font-size:14px;line-height:21px;color:${C.muted};">${escapeHtml(step.text)}</div></td></tr>`).join('');
}

/** Tables and inline styles remain usable when clients strip stylesheets, media queries, SVG and gradients. */
export function brandedEmail(content: EmailContent) {
  const { title, message, details = [], nextStep = '', steps = [], visit, code } = content;
  const tone = toneOf(content.tone);
  const status = content.status ?? tone.label;
  const cancelled = tone === tones.danger;
  const siteUrl = platformUrl();
  const safe = (link?: { label: string; url: string }) => link && /^https?:\/\//i.test(link.url) ? link : undefined;
  const action = safe(content.action);
  const secondary = safe(content.secondary);
  const iconCell = tone === tones.info
    ? `background-color:#FFFFFF;color:${C.primary};`
    : `background-color:${tone.color};color:#FFFFFF;`;
  const detailRows = details.map(([label, value]) => `<tr><td style="padding:13px 0;border-top:1px solid ${C.border};font-family:${FONT};font-size:14px;line-height:21px;color:${C.muted};width:42%;vertical-align:top;">${escapeHtml(label)}</td><td align="right" style="padding:13px 0;border-top:1px solid ${C.border};font-family:${FONT};font-size:14px;line-height:21px;font-weight:bold;color:${C.ink};overflow-wrap:anywhere;">${escapeHtml(value)}</td></tr>`).join('');
  const textDetails = [
    ...(visit ? [
      `Doctor: ${visit.doctor}`,
      `Appointment date: ${almaty(visit.startAt, { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Appointment time: ${almaty(visit.startAt, { timeStyle: 'short' })}${visit.endAt ? ` to ${almaty(visit.endAt, { timeStyle: 'short' })}` : ''} (Asia/Almaty)`,
      ...(visit.office ? [`Office / location: ${visit.office}`] : []),
      `Status: ${status}`,
    ] : []),
    ...(code ? [`Code: ${code}`] : []),
    ...details.map(([label, value]) => `${label}: ${value}`),
  ];
  const textSteps = steps.length ? '\n\nWhat happens next\n' + steps.map((step, index) => `${index + 1}. ${step.title}: ${step.text}`).join('\n') : '';
  return {
    text: `${title}\n\n${message}${textDetails.length ? '\n\n' + textDetails.join('\n') : ''}${textSteps}${nextStep ? '\n\n' + nextStep : ''}${action ? `\n${action.label}: ${action.url}` : ''}${secondary ? `\n${secondary.label}: ${secondary.url}` : ''}\n\nOpen Happy Patient: ${siteUrl}\nHappy Patient | Your care, connected.`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><style>@media (max-width:480px){.hp-pad{padding-left:20px!important;padding-right:20px!important}.hp-title{font-size:25px!important;line-height:31px!important}}</style><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:${C.page};font-family:${FONT};color:${C.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(message.split('\n')[0])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border-radius:28px;box-shadow:0 12px 32px rgba(43,99,246,0.08);">
<tr><td class="hp-pad" bgcolor="${C.primary}" style="padding:28px 32px 32px;background-color:${C.primary};background-image:linear-gradient(135deg,#3D74FF 0%,${C.primary} 45%,${C.deep} 100%);border-radius:28px 28px 0 0;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" style="width:32px;height:32px;background-color:#FFFFFF;border-radius:10px;color:${C.primary};font-size:17px;line-height:32px;">&#9829;</td><td style="padding-left:10px;font-size:18px;font-weight:bold;color:#FFFFFF;">HappyPatient</td></tr></table></td>
</tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;"><tr><td width="52" height="52" align="center" style="width:52px;height:52px;${iconCell}border-radius:16px;font-size:26px;line-height:52px;font-weight:bold;">${tone.icon}</td></tr></table>
<h1 class="hp-title" style="margin:18px 0 8px;font-size:30px;line-height:36px;font-weight:bold;letter-spacing:-0.6px;color:#FFFFFF;">${escapeHtml(title)}</h1>
<p style="margin:0;font-size:16px;line-height:24px;color:#E6ECFF;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
</td></tr>
<tr><td class="hp-pad" style="padding:28px 32px 8px;font-family:${FONT};">
${visit ? visitCard(visit, tone, status, cancelled) : ''}
${code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.soft};border-radius:20px;"><tr><td align="center" style="padding:22px 16px 6px;font-size:13px;color:${C.muted};">Your verification code</td></tr><tr><td align="center" style="padding:0 16px 22px;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:36px;line-height:44px;font-weight:bold;letter-spacing:12px;color:${C.ink};">${escapeHtml(code)}</td></tr></table>` : ''}
${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${visit || code ? 12 : 0}px;table-layout:fixed;">${detailRows}</table>` : ''}
${action ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td align="center" bgcolor="${C.primary}" style="background-color:${C.primary};border-radius:999px;"><a href="${escapeHtml(action.url)}" style="display:block;padding:15px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(action.label)}</a></td></tr></table>` : ''}
${secondary ? `<p style="margin:14px 0 0;text-align:center;font-size:14px;"><a href="${escapeHtml(secondary.url)}" style="color:${C.primary};font-weight:bold;text-decoration:none;">${escapeHtml(secondary.label)}</a></p>` : ''}
</td></tr>
${steps.length ? `<tr><td class="hp-pad" style="padding:20px 32px 32px;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.border};"><tr><td style="padding:24px 0 16px;font-size:17px;line-height:24px;font-weight:bold;color:${C.ink};">What happens next</td></tr><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepsList(steps)}</table></td></tr></table></td></tr>` : ''}
${nextStep ? `<tr><td class="hp-pad" style="padding:16px 32px 32px;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.soft};border-radius:16px;"><tr><td style="padding:16px 18px;font-size:14px;line-height:22px;color:${C.muted};">${escapeHtml(nextStep)}</td></tr></table></td></tr>` : ''}
${!steps.length && !nextStep ? '<tr><td style="padding:0 0 24px;"></td></tr>' : ''}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr><td align="center" style="padding:24px 16px 8px;font-family:${FONT};color:${C.muted};font-size:13px;line-height:20px;">
<a href="${escapeHtml(siteUrl)}/search" style="color:${C.muted};text-decoration:none;">Find a doctor</a> &nbsp;·&nbsp; <a href="${escapeHtml(siteUrl)}/appointments" style="color:${C.muted};text-decoration:none;">My appointments</a> &nbsp;·&nbsp; <a href="${escapeHtml(siteUrl)}" style="color:${C.primary};font-weight:bold;text-decoration:none;">Open Happy Patient</a><br>
<span style="font-size:12px;">© HappyPatient · Almaty. Your care, connected. This is an automated message, please do not reply.</span></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  };
}
