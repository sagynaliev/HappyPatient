import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from './prisma';
import { comparePassword, hashPassword, hashToken, randomToken, signToken } from './auth';
import { config } from './config';
import { requireAuth, requireRole } from './middleware';
import { registrationSchema, loginSchema, recoverySchema, resetSchema } from './validation';

const router = Router();
const parsed = <T>(schema: { parse: (v: unknown) => T }, body: unknown) => schema.parse(body);
const publicUser = (u: { id: string; email: string; firstName: string; lastName: string; role: Role; phone: string | null }) =>
  ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, phone: u.phone });

router.post('/auth/register', async (req, res) => {
  const input = parsed(registrationSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return res.status(409).json({ error: 'Email is already registered' });
  const { password, ...profile } = input;
  const user = await prisma.user.create({ data: { ...profile, passwordHash: await hashPassword(password) } });
  res.status(201).json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, role: user.role }) });
});

router.post('/auth/login', async (req, res) => {
  const input = parsed(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await comparePassword(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ user: publicUser(user), token: signToken({ id: user.id, email: user.email, role: user.role }) });
});

router.post('/auth/forgot-password', async (req, res) => {
  const { email } = parsed(recoverySchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const response: { message: string; devResetToken?: string; devMockEmail?: { to: string; resetToken: string } } = { message: 'If that email exists, a reset link has been sent' };
  if (user) {
    const token = randomToken();
    await prisma.resetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.RESET_TOKEN_EXPIRES_MINUTES * 60000) } });
    if (process.env.NODE_ENV !== 'production') {
      response.devResetToken = token;
      response.devMockEmail = { to: user.email, resetToken: token };
    }
  }
  res.json(response);
});

router.post('/auth/reset-password', async (req, res) => {
  const { token, password } = parsed(resetSchema, req.body);
  const record = await prisma.resetToken.findFirst({ where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
  if (!record) return res.status(400).json({ error: 'Invalid or expired reset token' });
  await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }), prisma.resetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })]);
  res.json({ message: 'Password has been reset' });
});

router.get('/me', requireAuth, async (req, res) => res.json({ user: await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true } }) }));
router.get('/categories', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  res.json({ categories: await prisma.category.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined, orderBy: { name: 'asc' } }) });
});
router.get('/doctors', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const doctors = await prisma.doctor.findMany({
    where: { ...(q ? { OR: [{ category: { name: { contains: q, mode: 'insensitive' } } }, { user: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } }] } : {}), ...(category ? { category: { name: { contains: category, mode: 'insensitive' } } } : {}) },
    include: { category: true, user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { user: { lastName: 'asc' } }
  });
  res.json({ doctors });
});
router.get('/admin/users', requireAuth, requireRole(Role.ADMIN), async (_req, res) => res.json({ users: await prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true }, orderBy: { createdAt: 'desc' } }) }));
export default router;
