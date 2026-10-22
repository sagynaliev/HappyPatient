import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';
import { releaseUnattendedSlots } from './appointmentLifecycle';

const server = app.listen(config.PORT, () => console.log(`API listening on ${config.PORT}`));
const releaseTimer = setInterval(() => { void releaseUnattendedSlots().catch((error: unknown) => console.error('Unattended slot release failed', { name: error instanceof Error ? error.name : undefined })); }, 60_000);
const shutdown = async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); };
process.on('SIGINT', () => { clearInterval(releaseTimer); void shutdown(); });
process.on('SIGTERM', () => { clearInterval(releaseTimer); void shutdown(); });
