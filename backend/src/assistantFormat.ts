/** "In-person · first visit" from a stored consultation type such as "in-person:first". */
export function consultationLabelText(type: string | null | undefined) {
  if (!type) return 'In-person · first visit';
  const [channel, kind] = type.split(':');
  return `${channel === 'online' ? 'Online' : 'In-person'} · ${kind === 'follow-up' ? 'follow-up visit' : 'first visit'}`;
}
