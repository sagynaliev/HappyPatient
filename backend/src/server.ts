import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';
import { releaseUnattendedSlots, sendUpcomingReminders } from './appointmentLifecycle';
import { runDailyIntegrityIfDue } from './adminOperations';

const server = app.listen(config.PORT, () => console.log(`API listening on ${config.PORT}`));
void releaseUnattendedSlots().catch(()=>undefined);
void sendUpcomingReminders().catch(()=>undefined);
void runDailyIntegrityIfDue().catch(()=>undefined);
const releaseTimer = setInterval(() => { void releaseUnattendedSlots().catch((error: unknown) => console.error('Unattended slot release failed', { name: error instanceof Error ? error.name : undefined })); }, config.SLOT_RELEASE_INTERVAL_MS);
const reminderTimer = setInterval(() => { void sendUpcomingReminders().catch(() => undefined); }, config.REMINDER_INTERVAL_MS);
const integrityTimer = setInterval(() => { void runDailyIntegrityIfDue().catch(() => undefined); }, config.INTEGRITY_INTERVAL_MS);
const shutdown = async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); };
process.on('SIGINT', () => { clearInterval(releaseTimer); clearInterval(reminderTimer); clearInterval(integrityTimer); void shutdown(); });
process.on('SIGTERM', () => { clearInterval(releaseTimer); clearInterval(reminderTimer); clearInterval(integrityTimer); void shutdown(); });
