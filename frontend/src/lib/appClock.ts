/**
 * Website side of the demo clock: reads the server's app time once at start-up and shifts the browser's
 * Date by the same offset, so screens that compare with "now" agree with the server.
 */
import { API_URL } from "./api";

const RealDate = Date;
let offsetMs = 0;

export const appClockOffsetMinutes = () => Math.round(offsetMs / 60_000);

function install() {
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
  Object.defineProperty(AppDate, "appClock", { value: true });
  globalThis.Date = AppDate as unknown as DateConstructor;
}

/** Never blocks start-up for long: without an answer the site keeps real time. */
export async function syncAppClock() {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${API_URL}/time`, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return;
    const { offsetMinutes } = (await response.json()) as { offsetMinutes?: number };
    if (!offsetMinutes) return;
    offsetMs = offsetMinutes * 60_000;
    install();
  } catch {
    // Real time.
  }
}
