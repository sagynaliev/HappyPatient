import { installAppClock } from './clock';
// Before anything handles a request: all time checks read the shiftable app clock.
installAppClock();
import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';
import { releaseUnattendedSlots, sendUpcomingReminders } from './appointmentLifecycle';
import { runDailyIntegrityIfDue } from './adminOperations';

const server = app.listen(config.PORT, () => console.log(`API listening on ${config.PORT}`));

/** Runs a background job on a timer without stacking runs: a slow run is skipped over, not doubled. */
function every(name: string, intervalMs: number, job: () => Promise<unknown>) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await job(); } catch (error: unknown) { console.error(`${name} failed`, { name: error instanceof Error ? error.name : undefined }); } finally { running = false; }
  };
  void run();
  return setInterval(() => void run(), intervalMs);
}
const timers = [
  every('Unattended slot release', config.SLOT_RELEASE_INTERVAL_MS, releaseUnattendedSlots),
  every('Visit reminders', config.REMINDER_INTERVAL_MS, sendUpcomingReminders),
  every('Daily integrity check', config.INTEGRITY_INTERVAL_MS, runDailyIntegrityIfDue),
];
// One failed background promise must not take the API down for everyone.
process.on('unhandledRejection', (reason: unknown) => console.error('Unhandled rejection', { name: reason instanceof Error ? reason.name : typeof reason }));

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  timers.forEach(clearInterval);
  // Let requests in flight finish, then release the database connections.
  server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
