import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import router from './routes';
import { config } from './config';
import { errorHandler } from './middleware';

export const app = express();
// Behind the host's proxy (Render): take the caller's address from X-Forwarded-For so request limits apply per visitor.
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL ?? false }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', router);
app.use(errorHandler);
