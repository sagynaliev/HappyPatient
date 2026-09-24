import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from './prisma';
import { comparePassword, hashPassword, hashToken, randomToken, randomVerificationCode, signToken } from './auth';
import { config } from './config';
import { requireAuth, requireRole } from './middleware';
import { registrationSchema, loginSchema, recoverySchema, resetSchema, verificationCodeSchema } from './validation';
import { Resend } from 'resend';

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
  const response = { message: 'If that email exists, a verification code has been sent' };
  if (user) {
    const cooldownSince = new Date(Date.now() - 60_000);
    const recentCode = await prisma.resetToken.findFirst({ where: { userId: user.id, createdAt: { gt: cooldownSince }, usedAt: null }, select: { id: true } });
    if (!recentCode) {
      console.info(`RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)}`);
      if (!config.RESEND_API_KEY) return res.status(503).json({ error: 'Password recovery email is not configured.' });
      const code = randomVerificationCode();
      const resend = new Resend(config.RESEND_API_KEY);
      try {
        const { error } = await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: user.email,
          subject: 'Your HappyPatient password reset code',
          text: `Your HappyPatient password reset code is: ${code}\n\nThis code expires in 10 minutes and can only be used once.`,
        });
        if (error) {
          console.error('Resend rejected password recovery email', {
            statusCode: error.statusCode,
            name: error.name,
            message: error.message,
            code: 'code' in error ? error.code : undefined,
          });
          return res.status(502).json({ error: 'We could not send the verification code. Please try again.' });
        }
        console.info('Resend accepted password recovery email');
      } catch (error: unknown) {
        console.error('Resend request failed while sending password recovery email', {
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : undefined,
        });
        return res.status(502).json({ error: 'We could not send the verification code. Please try again.' });
      }
      await prisma.$transaction([
        prisma.resetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
        prisma.resetToken.create({ data: { userId: user.id, tokenHash: hashToken(code), expiresAt: new Date(Date.now() + 10 * 60_000) } }),
      ]);
    }
  }
  res.json(response);
});

router.post('/auth/verify-reset-code', async (req, res) => {
  const { email, code } = parsed(verificationCodeSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification code.' });
  const record = await prisma.resetToken.findFirst({ where: { userId: user.id, tokenHash: hashToken(code), usedAt: null, expiresAt: { gt: new Date() } } });
  if (!record) return res.status(400).json({ error: 'Invalid or expired verification code.' });
  const resetToken = randomToken();
  await prisma.$transaction([
    prisma.resetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.resetToken.create({ data: { userId: user.id, tokenHash: hashToken(resetToken), expiresAt: new Date(Date.now() + 10 * 60_000) } }),
  ]);
  res.json({ resetToken });
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
