import { beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';

const db=vi.hoisted(()=>({
  scheduleSlot:{findMany:vi.fn()},
  reminderSent:{create:vi.fn()},
  notification:{create:vi.fn()},
  $transaction:vi.fn(),
}));
vi.mock('./prisma',()=>({prisma:db}));

let sendUpcomingReminders:(now?:Date)=>Promise<{count:number}>;
const now=new Date('2026-11-02T00:00:00.000Z');
const booking=()=>({
  id:'slot-1',patientId:'patient-1',status:'BOOKED',startAt:new Date('2026-11-02T01:00:00.000Z'),
  updatedAt:new Date('2026-11-01T10:00:00.000Z'),patient:{id:'patient-1'},
  doctor:{user:{firstName:'Sam',lastName:'Doctor'},streetAddress:'10 Main Street',officeNumber:'4',clinicName:'Clinic',office:'Office',location:null},
});
const sent=new Set<string>();
beforeAll(async()=>{process.env.DATABASE_URL||='postgresql://user:pass@localhost:5432/test';process.env.JWT_SECRET||='test-secret-with-at-least-16-chars';({sendUpcomingReminders}=await import('./appointmentLifecycle.js'));});
beforeEach(()=>{
  vi.resetAllMocks();sent.clear();
  db.$transaction.mockImplementation((callback)=>callback(db));
  db.scheduleSlot.findMany.mockResolvedValue([booking()]);
  db.reminderSent.create.mockImplementation(({data}:{data:{appointmentId:string;bookingVersion:Date;kind:string}})=>{
    const key=data.appointmentId+data.bookingVersion.toISOString()+data.kind;
    if(sent.has(key))return Promise.reject({code:'P2002'});
    sent.add(key);return Promise.resolve({id:key});
  });
  db.notification.create.mockImplementation(({data}:{data:{message:string}})=>Promise.resolve(data));
});

describe('upcoming appointment reminders',()=>{
  it('sends only the nearer reminder when booking is already inside that reminder window',async()=>{
    const result=await sendUpcomingReminders(now);
    expect(result.count).toBe(1);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create.mock.calls[0][0].data.message).toContain('06:00');
    expect(db.notification.create.mock.calls[0][0].data.message).toContain('10 Main Street');
    expect(db.notification.create.mock.calls[0][0].data.eventKey).toContain('2h');
  });
  it('does not duplicate the same booking window on repeated job runs',async()=>{
    await sendUpcomingReminders(now);
    const result=await sendUpcomingReminders(now);
    expect(result.count).toBe(0);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });
  it('remains idempotent under concurrent worker runs',async()=>{
    const results=await Promise.all([sendUpcomingReminders(now),sendUpcomingReminders(now)]);
    expect(results.reduce((sum,item)=>sum+item.count,0)).toBe(1);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });
  it('queries only booked future appointments and ignores canceled or past mock candidates',async()=>{
    const past={...booking(),startAt:new Date('2026-11-01T23:00:00.000Z')};
    const cancelled={...booking(),status:'FREE'};
    db.scheduleSlot.findMany.mockImplementation(({where}:{where:{status:string;startAt:{gt:Date}}})=>Promise.resolve(where.status==='BOOKED'&&past.startAt>where.startAt.gt?[past]:cancelled.status==='BOOKED'?[cancelled]:[]));
    expect(await sendUpcomingReminders(now)).toEqual({count:0});
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
