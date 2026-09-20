import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';

const server = app.listen(config.PORT, () => console.log(`API listening on ${config.PORT}`));
const shutdown = async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
