import { describe, expect, it } from 'vitest';
import { clinicDateBounds, clinicTimeToUtc, generateScheduleSlots, localDateAt, localTimeToUtc, utcDateBounds } from './schedule';

describe('schedule slot generation', () => {
  it('treats entered times as clinic-local (Asia/Almaty, UTC+5) and creates contiguous 30-minute slots', () => {
    const slots = generateScheduleSlots({ date: '2099-05-10', startTime: '13:00', endTime: '15:00' });
    expect(slots).toHaveLength(4);
    expect(slots[0].startAt.toISOString()).toBe('2099-05-10T08:00:00.000Z');
    expect(slots[0].endAt.toISOString()).toBe(slots[1].startAt.toISOString());
    expect(slots[3].endAt.toISOString()).toBe('2099-05-10T10:00:00.000Z');
  });

  it('converts clinic-local times with minutes, including early-morning slots on the previous UTC day', () => {
    expect(clinicTimeToUtc('2026-10-22', '13:30').toISOString()).toBe('2026-10-22T08:30:00.000Z');
    expect(clinicTimeToUtc('2026-10-22', '02:00').toISOString()).toBe('2026-10-21T21:00:00.000Z');
  });

  it('returns UTC bounds for a clinic-local day', () => {
    const bounds = clinicDateBounds('2026-10-22');
    expect(bounds.start.toISOString()).toBe('2026-10-21T19:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-10-22T19:00:00.000Z');
  });

  it('returns UTC day boundaries for filtering', () => {
    const bounds = utcDateBounds('2099-05-10');
    expect(bounds.start.toISOString()).toBe('2099-05-10T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2099-05-11T00:00:00.000Z');
  });

  it('converts local calendar and time boundaries across time zones', () => {
    expect(localDateAt(new Date('2026-10-07T19:30:00.000Z'), 'Asia/Almaty')).toBe('2026-10-08');
    expect(localTimeToUtc('2026-10-07', 6, 'Asia/Almaty').toISOString()).toBe('2026-10-07T01:00:00.000Z');
    expect(localTimeToUtc('2026-03-08', 6, 'America/New_York').toISOString()).toBe('2026-03-08T10:00:00.000Z');
  });
});