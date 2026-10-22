import { scheduleSchema } from './validation';

/** All schedule times entered by doctors and shown in the app are clinic-local (Kazakhstan, UTC+5). */
export const CLINIC_TIME_ZONE = 'Asia/Almaty';

/** Converts a clinic-local calendar date and HH:MM time into the matching UTC instant. */
export function clinicTimeToUtc(date: string, time: string, timeZone = CLINIC_TIME_ZONE) {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(localTimeToUtc(date, hour, timeZone).getTime() + minute * 60_000);
}

export function generateScheduleSlots(input: unknown, timeZone = CLINIC_TIME_ZONE) {
  const { date, startTime, endTime } = scheduleSchema.parse(input);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = clinicTimeToUtc(date, startTime, timeZone).getTime();
  const end = clinicTimeToUtc(date, endTime, timeZone).getTime();
  const slots: Array<{ startAt: Date; endAt: Date }> = [];

  for (let cursor = start; cursor + 30 * 60_000 <= end; cursor += 30 * 60_000) {
    slots.push({ startAt: new Date(cursor), endAt: new Date(cursor + 30 * 60_000) });
  }

  if (startHour * 60 + startMinute >= endHour * 60 + endMinute || !slots.length) {
    throw new Error('The schedule range must contain at least one 30-minute slot.');
  }
  return slots;
}

export function utcDateBounds(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

/** UTC range covering one clinic-local calendar day. */
export function clinicDateBounds(date: string, timeZone = CLINIC_TIME_ZONE) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: localTimeToUtc(date, 0, timeZone), end: localTimeToUtc(next.toISOString().slice(0, 10), 0, timeZone) };
}

export function localDateAt(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function localTimeToUtc(date: string, hour: number, timeZone: string) {
  const localDate = new Date(`${date}T00:00:00.000Z`);
  localDate.setUTCHours(hour);
  const target = localDate.getTime();
  let timestamp = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    const displayedAsUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    const correction = target - displayedAsUtc;
    timestamp += correction;
    if (correction === 0) break;
  }
  return new Date(timestamp);
}