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