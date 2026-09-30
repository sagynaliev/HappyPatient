import { describe, expect, it } from 'vitest';
import { generateScheduleSlots, utcDateBounds } from './schedule';

describe('schedule slot generation', () => {
  it('creates contiguous 30-minute slots in UTC', () => {
    const slots = generateScheduleSlots({ date: '2099-05-10', startTime: '09:00', endTime: '11:00' });
    expect(slots).toHaveLength(4);
    expect(slots[0].startAt.toISOString()).toBe('2099-05-10T09:00:00.000Z');
    expect(slots[0].endAt.toISOString()).toBe(slots[1].startAt.toISOString());
    expect(slots[3].endAt.toISOString()).toBe('2099-05-10T11:00:00.000Z');
  });

  it('returns UTC day boundaries for filtering', () => {
    const bounds = utcDateBounds('2099-05-10');
    expect(bounds.start.toISOString()).toBe('2099-05-10T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2099-05-11T00:00:00.000Z');
  });
});