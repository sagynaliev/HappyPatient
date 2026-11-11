import { Request, Response, NextFunction } from 'express';

/**
 * Small in-memory request limiter for the sign-in and recovery endpoints: it stops password guessing and
 * keeps a flood of hashing work from starving everyone else. Counters live in this process, which fits the
 * single API instance this project runs; several instances would each count separately.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: (req: Request) => string; message?: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  // Real time on purpose: the demo clock must not open or close a limit window.
  const now = () => performance.timeOrigin + performance.now();
  const sweep = setInterval(() => { const at = now(); for (const [key, entry] of hits) if (entry.resetAt <= at) hits.delete(key); }, options.windowMs);
  sweep.unref();
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.RATE_LIMIT === 'off') return next();
    const key = `${req.ip ?? 'unknown'}|${options.key?.(req) ?? ''}`;
    const at = now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= at) { hits.set(key, { count: 1, resetAt: at + options.windowMs }); return next(); }
    entry.count += 1;
    if (entry.count <= options.max) return next();
    res.set('Retry-After', String(Math.ceil((entry.resetAt - at) / 1000)));
    return res.status(429).json({ error: options.message ?? 'Too many attempts. Please wait a few minutes and try again.' });
  };
}
