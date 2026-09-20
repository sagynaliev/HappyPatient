import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import router from './routes';
import { config } from './config';
import { errorHandler } from './middleware';

export const app = express();
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', router);
app.use(errorHandler);
