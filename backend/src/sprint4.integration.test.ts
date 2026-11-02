import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@prisma/client';

// Opt-in against a disposable, migrated database, never the normal application DB.
describe.skipIf(!process.env.SPRINT4_DATABASE_URL)('Sprint 4–6 PostgreSQL integration', () => {
  let prisma: (typeof import('./prisma.js'))['prisma'];
  let app: (typeof import('./app.js'))['app'];
  let signToken: (typeof import('./auth.js'))['signToken'];
  const prefix = `sprint4-${Date.now()}`;
  let doctorId: string; let categoryId: string;
  const patientId = prefix+'-patient'; const doctorUserId = prefix+'-doctor'; const deskId = prefix+'-desk'; const adminId=prefix+'-admin';
  const now = new Date();
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.SPRINT4_DATABASE_URL!;
    process.env.JWT_SECRET ||= 'integration-only-secret-for-tests';
    ({ prisma } = await import('./prisma.js')); ({ app } = await import('./app.js')); ({ signToken } = await import('./auth.js'));
    const category = await prisma.category.create({ data: { name: prefix } }); categoryId = category.id;
    for (const [id, role] of [[patientId, Role.PATIENT], [doctorUserId, Role.DOCTOR], [deskId, Role.FRONT_DESK], [adminId, Role.ADMIN]] as const) await prisma.user.create({ data: { id, email: `${id}@example.test`, firstName: 'QA', lastName: 'Test', role, passwordHash: 'unused' } });
    const doctor = await prisma.doctor.create({ data: { userId: doctorUserId, categoryId, consultationFee: 1000 } }); doctorId = doctor.id;
  });
  afterAll(async () => {
    // The opt-in database is disposable. Sprint 5–6 makes medical history immutable,
    // so integration fixtures are retained instead of bypassing the database guard.
    if (prisma) await prisma.$disconnect();
  });
  it('two real transactions expire the same booking only once, preserving occupied and checked-in slots', async () => {
    const startAt = new Date(now.getTime() - 600000);
    const ids = [`${prefix}-expired`, `${prefix}-occupied`, `${prefix}-checked`];
    for (let i = 0; i < ids.length; i++) await prisma.scheduleSlot.create({ data: { id: ids[i], doctorId, patientId, startAt: new Date(startAt.getTime() - i * 60000), endAt: now, status: i === 1 ? 'OCCUPIED' : 'BOOKED', checkedInAt: i === 2 ? now : null } });
    const { releaseUnattendedSlots } = await import('./appointmentLifecycle.js');
    await Promise.all([releaseUnattendedSlots(now), releaseUnattendedSlots(now)]);
    expect(await prisma.expiredAppointment.count({ where: { slotId: ids[0] } })).toBe(1);
    expect((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: ids[0] } })).status).toBe('FREE');
    expect((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: ids[1] } })).status).toBe('OCCUPIED');
    expect((await prisma.scheduleSlot.findUniqueOrThrow({ where: { id: ids[2] } })).status).toBe('BOOKED');
  });
  it('orders linked history by clinical visit time and the database rejects chronology edits/deletes', async () => {
    const older=await prisma.scheduleSlot.create({data:{doctorId,patientId,startAt:new Date(now.getTime()-86_400_000),endAt:new Date(now.getTime()-86_000_000),status:'OCCUPIED'}});
    const newer=await prisma.scheduleSlot.create({data:{doctorId,patientId,startAt:new Date(now.getTime()-43_200_000),endAt:new Date(now.getTime()-42_800_000),status:'OCCUPIED'}});
    await prisma.medicalEntry.create({data:{patientId,doctorId,appointmentId:newer.id,category:'test',title:'Newer visit',body:'Synthetic note'}});
    await prisma.medicalEntry.create({data:{patientId,doctorId,appointmentId:older.id,category:'anamnesis',title:'Older visit',body:'Synthetic note'}});
    const bearer=(id:string,role:Role)=>'Bearer '+signToken({id,role,email:id+'@example.test'});
    const response=await request(app).get('/api/medical-history?direction=asc&patientId='+encodeURIComponent(patientId)).set('Authorization',bearer(doctorUserId,Role.DOCTOR)).expect(200);
    expect(response.body.entries.map((entry:{title:string})=>entry.title)).toEqual(['Older visit','Newer visit']);
    const entry=await prisma.medicalEntry.findFirstOrThrow({where:{title:'Older visit',patientId}});
    const sequence=await prisma.medicalEntry.findMany({where:{patientId},orderBy:{patientSequence:'asc'},select:{patientSequence:true}});
    expect(sequence.map(item=>item.patientSequence)).toEqual(sequence.map((_,index)=>index+1));
    await expect(prisma.medicalEntry.update({where:{id:entry.id},data:{createdAt:new Date(entry.createdAt.getTime()-1000)}})).rejects.toThrow();
    await expect(prisma.medicalEntry.update({where:{id:entry.id},data:{patientSequence:999}})).rejects.toThrow();
    await expect(prisma.medicalEntry.delete({where:{id:entry.id}})).rejects.toThrow();
  });
  it('sends a booking-window reminder once under concurrent database workers', async () => {
    const slot=await prisma.scheduleSlot.create({data:{doctorId,patientId,startAt:new Date(Date.now()+60*60_000),endAt:new Date(Date.now()+90*60_000),status:'BOOKED'}});
    const {sendUpcomingReminders}=await import('./appointmentLifecycle.js');
    const results=await Promise.all([sendUpcomingReminders(),sendUpcomingReminders()]);
    expect(results.reduce((sum,row)=>sum+row.count,0)).toBeGreaterThanOrEqual(1);
    expect(await prisma.reminderSent.count({where:{appointmentId:slot.id,kind:'2h'}})).toBe(1);
    expect(await prisma.notification.count({where:{slotId:slot.id,type:'VISIT_REMINDER'}})).toBe(1);
  });
  it('manages reference hierarchy, audits changes and removes inactive references from doctor search',async()=>{
    const bearer=(id:string,role:Role)=>'Bearer '+signToken({id,role,email:id+'@example.test'});
    const auth=bearer(adminId,Role.ADMIN);
    const city=(await request(app).post('/api/admin/reference/locations').set('Authorization',auth).send({name:prefix+' City',kind:'city',parentId:null}).expect(201)).body.location;
    const floor=(await request(app).post('/api/admin/reference/locations').set('Authorization',auth).send({name:prefix+' Floor',kind:'floor',parentId:city.id}).expect(201)).body.location;
    const office=(await request(app).post('/api/admin/reference/locations').set('Authorization',auth).send({name:prefix+' Office',kind:'office',parentId:floor.id}).expect(201)).body.location;
    await request(app).patch('/api/admin/doctors/'+doctorId+'/location').set('Authorization',auth).send({locationId:office.id}).expect(200);
    const active=(await request(app).get('/api/doctors?city='+encodeURIComponent(city.name)).expect(200)).body.doctors as Array<{id:string}>;
    expect(active.some(item=>item.id===doctorId)).toBe(true);
    const reference=(await request(app).get('/api/admin/reference/locations').set('Authorization',auth).expect(200)).body.locations as Array<{id:string;usage:{doctors:number;slots:number}}>;
    expect(reference.find(item=>item.id===office.id)?.usage.doctors).toBe(1);
    await request(app).patch('/api/admin/reference/locations/'+office.id).set('Authorization',auth).send({active:false}).expect(200);
    const inactive=(await request(app).get('/api/doctors?city='+encodeURIComponent(city.name)).expect(200)).body.doctors as Array<{id:string}>;
    expect(inactive.some(item=>item.id===doctorId)).toBe(false);
    await request(app).patch('/api/admin/reference/locations/'+office.id).set('Authorization',auth).send({active:true}).expect(200);
    await request(app).patch('/api/admin/reference/categories/'+categoryId).set('Authorization',auth).send({active:false}).expect(200);
    const inactiveCategory=(await request(app).get('/api/doctors?city='+encodeURIComponent(city.name)).expect(200)).body.doctors as Array<{id:string}>;
    expect(inactiveCategory.some(item=>item.id===doctorId)).toBe(false);
    const audits=(await request(app).get('/api/admin/reference/audit').set('Authorization',auth).expect(200)).body.audits as Array<{entityId:string}>;
    expect(audits.some(item=>item.entityId===office.id)).toBe(true);
  });
  it('creates and reads a real categorized note and keeps other patients out', async () => {
    const slot = await prisma.scheduleSlot.create({ data: { doctorId, patientId, startAt: new Date(now.getTime() - 1000), endAt: new Date(now.getTime() + 600000), status: 'OCCUPIED' } });
    const bearer = (id: string, role: Role) => `Bearer ${signToken({ id, role, email: `${id}@example.test` })}`;
    await request(app).post('/api/medical-history').set('Authorization', bearer(doctorUserId, Role.DOCTOR)).send({ appointmentId: slot.id, category: 'test', title: 'QA test entry', body: 'Synthetic test content' }).expect(201);
    const own = await request(app).get('/api/medical-history?patientId=forged').set('Authorization', bearer(patientId, Role.PATIENT)).expect(200);
    expect(own.body.entries.some((entry:{title:string})=>entry.title==='QA test entry')).toBe(true); expect(own.body.counts.test).toBe(2);
    const other = await request(app).get(`/api/medical-history?patientId=${patientId}`).set('Authorization', bearer('other-test-user', Role.PATIENT)).expect(200);
    expect(other.body.entries).toHaveLength(0);
  });
});
