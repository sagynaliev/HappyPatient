/**
 * App clock for demos and testing. An admin can move "now" forward or back by an offset so time-based
 * rules (10-minute auto-release, reminders, check-in window) can be shown without waiting.
 * The offset lives in memory: a server restart returns to real time. Set TIME_CONTROL=off to disable.
 */
const RealDate = Date;
let offsetMs = 0;

export const timeControlEnabled = () => process.env.TIME_CONTROL !== 'off';
export const clockOffsetMs = () => offsetMs;
export const realNow = () => RealDate.now();

export function setClockOffset(ms: number) {
  offsetMs = timeControlEnabled() ? Math.round(ms) : 0;
}

/** Replaces the global Date once at server start so every `new Date()` and `Date.now()` follows the offset. */
export function installAppClock() {
  if ((globalThis.Date as unknown as { appClock?: boolean }).appClock) return;
  class AppDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offsetMs);
      else super(...(args as [number]));
    }
    static now() {
      return RealDate.now() + offsetMs;
    }
  }
  Object.defineProperty(AppDate, 'appClock', { value: true });
  globalThis.Date = AppDate as unknown as DateConstructor;
}
