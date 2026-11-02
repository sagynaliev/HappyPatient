export const NO_CHECKIN_GRACE_MS = 10 * 60_000;
export const WALK_IN_WINDOW_MS = 30 * 60_000;
export function getWalkInSlotStatus(visitStart: Date, now: Date): 'occupied' | 'booked' {
  // Inclusive: exactly 30 minutes, current and already-started visits are occupied.
  return visitStart.getTime() - now.getTime() <= WALK_IN_WINDOW_MS ? 'occupied' : 'booked';
}
