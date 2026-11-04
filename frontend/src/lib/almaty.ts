/** Date helpers for clinic time (Asia/Almaty). Day keys are YYYY-MM-DD in clinic time. */
export const CLINIC_TZ = "Asia/Almaty";

export const dayKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TZ }).format(new Date(value));

export const clock = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

export const formatInClinic = (value: string | Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TZ, ...options }).format(new Date(value));

/** Formats a day key itself (no time-zone shift). */
export const formatDayKey = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(new Date(`${key}T00:00:00Z`));

export function addDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday-to-Sunday day keys of the week containing the key. */
export function weekOf(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  const monday = addDays(key, -((date.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Minutes since midnight in clinic time. */
export function clinicMinutes(value: string | Date) {
  const [hours, minutes] = clock(value).split(":").map(Number);
  return hours * 60 + minutes;
}
