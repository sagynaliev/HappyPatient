import { scheduleSchema } from './validation';

export function generateScheduleSlots(input: unknown) {
  const { date, startTime, endTime } = scheduleSchema.parse(input);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = Date.parse(`${date}T${startTime}:00.000Z`);
  const end = Date.parse(`${date}T${endTime}:00.000Z`);
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