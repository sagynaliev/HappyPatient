import { describe, it, expect } from 'vitest';
import { getWalkInSlotStatus } from './visitTime';
describe('walk-in status UTC boundary', () => {
  const now = new Date('2026-11-02T05:00:00Z');
  it.each([[30 * 60000, 'occupied'], [30 * 60000 + 1000, 'booked'], [0, 'occupied'], [-60000, 'occupied']])('%i ms yields %s', (delta, status) => {
    expect(getWalkInSlotStatus(new Date(now.getTime() + Number(delta)), now)).toBe(status);
  });
  it('compares instants regardless of timezone notation', () => {
    expect(getWalkInSlotStatus(new Date('2026-11-02T10:30:00+05:00'), now)).toBe('occupied');
  });
});
