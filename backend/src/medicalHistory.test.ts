import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Role } from '@prisma/client';
const db = vi.hoisted(() => ({ scheduleSlot: { findFirst: vi.fn() }, historyAccessAudit: { create: vi.fn() }, medicalEntry: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() }, $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn(), $transaction: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: db }));
let app: express.Express;
let token: (role: Role) => string;
beforeAll(async () => {
  process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test'; process.env.JWT_SECRET ||= 'test-secret-with-at-least-16-chars';
  const { medicalHistoryRouter } = await import('./medicalHistory.js'); const { signToken } = await import('./auth.js');
  token = role => `Bearer ${signToken({ id: 'session-user', email: 'test@example.test', role })}`;
  app = express(); app.use(express.json()); app.use(medicalHistoryRouter);
});
beforeEach(() => { vi.resetAllMocks(); db.$transaction.mockImplementation(callback => callback(db)); db.historyAccessAudit.create.mockResolvedValue({id:'audit'}); db.scheduleSlot.findFirst.mockResolvedValue({ id: 'visit', patientId: 'patient', doctorId: 'doctor' }); db.medicalEntry.create.mockResolvedValue({ id: 'note' }); db.medicalEntry.findMany.mockResolvedValue([]); db.medicalEntry.findUnique.mockResolvedValue(null); db.medicalEntry.groupBy.mockResolvedValue([]); db.$queryRaw.mockResolvedValue([]); db.$queryRawUnsafe.mockResolvedValue([]); });
const valid = { appointmentId: 'visit', category: 'anamnesis', title: 'Title', body: 'Note' };
describe('medical history authorization and validation', () => {
  it.each(['test', 'anamnesis', 'conclusion'])('doctor creates %s entry from authorized visit', async category => {
    const result = await request(app).post('/medical-history').set('Authorization', token(Role.DOCTOR)).send({ ...valid, category, patientId: 'forged' });
    expect(result.status).toBe(201); expect(db.medicalEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ patientId: 'patient', doctorId: 'doctor', category }) }));
    expect(db.scheduleSlot.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ doctor: { userId: 'session-user' }, status: 'OCCUPIED' }) }));
  });
  it.each([{ category: 'other' }, { title: '' }, { title: '   ' }, { body: '' }, { title: 'x'.repeat(121) }, { body: 'x'.repeat(5001) }])('rejects invalid fields', async invalid => { expect((await request(app).post('/medical-history').set('Authorization', token(Role.DOCTOR)).send({ ...valid, ...invalid })).status).toBe(400); expect(db.medicalEntry.create).not.toHaveBeenCalled(); });
  it('rejects doctor without eligible visit', async () => { db.scheduleSlot.findFirst.mockResolvedValue(null); expect((await request(app).post('/medical-history').set('Authorization', token(Role.DOCTOR)).send(valid)).status).toBe(404); });
  it('rejects patient writes', async () => { expect((await request(app).post('/medical-history').set('Authorization', token(Role.PATIENT)).send(valid)).status).toBe(404); });
  it('derives patient identity from session even when another ID is supplied', async () => { const result = await request(app).get('/medical-history?patientId=someone-else').set('Authorization', token(Role.PATIENT)); expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('no-store'); expect(db.$queryRaw).toHaveBeenCalled(); expect(db.$queryRaw.mock.calls[0][0].sql).toContain('e."patientId"'); expect(db.$queryRaw.mock.calls[0][0].values).toContain('session-user'); });
  it('doctor cannot read unrelated history', async () => { db.scheduleSlot.findFirst.mockResolvedValue(null); expect((await request(app).get('/medical-history?patientId=other').set('Authorization', token(Role.DOCTOR))).status).toBe(404); expect(db.medicalEntry.findMany).not.toHaveBeenCalled(); });
  it('does not treat a cancelled-only doctor visit as an assignment', async () => { db.scheduleSlot.findFirst.mockResolvedValue(null); const result=await request(app).get('/medical-history?patientId=patient').set('Authorization',token(Role.DOCTOR));expect(result.status).toBe(404);expect(db.scheduleSlot.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:[{status:'OCCUPIED'},{status:'BOOKED',startAt:{gt:expect.any(Date)}}]})})); });
  it.each([Role.ADMIN, Role.FRONT_DESK])('rejects %s reads', async role => { expect((await request(app).get('/medical-history').set('Authorization', token(role))).status).toBe(404); });
  it('rejects and audits anonymous reads', async () => { expect((await request(app).get('/medical-history')).status).toBe(401); expect(db.historyAccessAudit.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorId:null,actorRole:null,endpoint:'list',outcome:'denied'})})); });
  it('paginates and counts categories', async () => { db.$queryRaw.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ id:String(index),doctorFirstName:'A',doctorLastName:'B' }))); db.medicalEntry.groupBy.mockResolvedValue([{ category: 'test', _count: 25 }]); const result = await request(app).get('/medical-history?offset=20').set('Authorization', token(Role.PATIENT)); expect(result.body.entries).toHaveLength(20); expect(result.body.hasMore).toBe(true); expect(result.body.counts.test).toBe(25); });
  it('policy-checks individual entry reads and returns the same 404 denial', async () => {
    db.medicalEntry.findUnique.mockResolvedValue({id:'entry',patientId:'patient',doctorId:'doctor',category:'test',title:'Private title',body:'Private body',createdAt:new Date(),updatedAt:new Date(),doctor:{user:{firstName:'A',lastName:'B'}}});
    const allowed=await request(app).get('/medical-history/entry').set('Authorization',token(Role.DOCTOR));
    expect(allowed.status).toBe(200);
    const denied=await request(app).get('/medical-history/entry').set('Authorization',token(Role.ADMIN));
    expect(denied.status).toBe(404);expect(denied.body).toEqual({error:'History unavailable.'});
    expect(db.historyAccessAudit.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({endpoint:'get',targetPatientId:'patient',outcome:'denied'})}));
  });
  it('policy-checks export and derives the patient from the authenticated session', async () => {
    const result=await request(app).get('/medical-history/export?patientId=forged').set('Authorization',token(Role.PATIENT));
    expect(result.status).toBe(200);
    expect(db.$queryRawUnsafe).toHaveBeenCalled(); expect(db.$queryRawUnsafe.mock.calls[0][1]).toBe('session-user');
  });
  it('returns generic errors without logging private data', async () => { const log = vi.spyOn(console, 'error'); db.medicalEntry.create.mockRejectedValue(new Error('private content')); const result = await request(app).post('/medical-history').set('Authorization', token(Role.DOCTOR)).send(valid); expect(result.status).toBe(500); expect(JSON.stringify(result.body)).not.toContain('private content'); expect(log).not.toHaveBeenCalled(); log.mockRestore(); });
});
