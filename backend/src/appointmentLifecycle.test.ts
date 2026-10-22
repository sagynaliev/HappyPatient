import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateMany = vi.hoisted(() => vi.fn());
vi.mock('./prisma', () => ({ prisma: { scheduleSlot: { updateMany } } }));

import { releaseUnattendedSlots } from './appointmentLifecycle';

describe('unattended appointment release', () => {
  beforeEach(() => updateMany.mockReset().mockResolvedValue({ count: 2 }));

  it('releases only booked slots whose start time is at least ten minutes old', async () => {
    const now = new Date('2026-10-20T10:00:00.000Z');
    await releaseUnattendedSlots(now);
    expect(updateMany).toHaveBeenCalledWith({
      where: { status: 'BOOKED', startAt: { lte: new Date('2026-10-20T09:50:00.000Z') } },
      data: { status: 'FREE', patientId: null, visitPurpose: null },
    });
  });
});
