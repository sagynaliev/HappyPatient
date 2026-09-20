import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyToken } from './auth';
import { ZodError } from 'zod';

declare global { namespace Express { interface Request { user?: { id: string; email: string; role: Role } } } }
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const value = req.header('authorization');
  if (!value?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = verifyToken(value.slice(7)); next(); } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' });
export const requireAdmin = requireRole(Role.ADMIN);
export const requireDoctor = requireRole(Role.DOCTOR);
export const requirePatient = requireRole(Role.PATIENT);
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
