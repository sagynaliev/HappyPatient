import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({
  scheduleSlot:{groupBy:vi.fn()},
  cancelledAppointment:{count:vi.fn()},
  expiredAppointment:{count:vi.fn()},
  integrityRun:{create:vi.fn(),update:vi.fn(),findFirst:vi.fn()},
  $queryRawUnsafe:vi.fn(),
  medicalEntry:{count:vi.fn()},
}));
vi.mock('./prisma',()=>({prisma:db}));
import {collectIntegrityChecks,getAdminStatistics,runAndStoreIntegrity} from './adminOperations';

describe('administrator statistics aggregation',()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    db.scheduleSlot.groupBy.mockResolvedValue([{status:'BOOKED',_count:1},{status:'OCCUPIED',_count:1},{status:'FREE',_count:1}]);
    db.$queryRawUnsafe.mockImplementation((sql:string)=>{
      if(sql.includes('first_visits'))return Promise.resolve([{newPatients:1,returningPatients:1}]);
      if(sql.includes('date_trunc'))return Promise.resolve([{period:'2026-01-01',visits:1},{period:'2026-01-02',visits:1}]);
      if(sql.includes('AS "doctorId"'))return Promise.resolve([{doctorId:'doctor-1',doctorName:'Sam Doctor',specialty:'Cardiology',bookedCount:1,completedCount:1,bookedMinutes:90,availableMinutes:120,utilization:0.75,averageAppointmentsPerWorkingDay:1,cancelled:1,expired:0,office:'Office 4'}]);
      if(sql.includes('COALESCE(l."name",d."office"'))return Promise.resolve([{name:'Office 4',visits:2}]);
      if(sql.includes('JOIN "Category"'))return Promise.resolve([{name:'Cardiology',visits:2}]);
      return Promise.resolve([]);
    });
    db.cancelledAppointment.count.mockResolvedValue(1);
    db.expiredAppointment.count.mockResolvedValue(0);

  });
  it('calculates utilization, working-day average, first-time and returning patient totals without patient identifiers',async()=>{
    const result=await getAdminStatistics(new Date('2026-01-01T00:00:00Z'),new Date('2026-01-03T00:00:00Z'),'day');
    expect(result.totalVisits).toBe(2);
    expect(result.utilization).toBe(0.75);
    expect(result.newPatients).toBe(1);expect(result.returningPatients).toBe(1);
    expect(result.doctorWorkload[0]).toMatchObject({bookedCount:1,completedCount:1,bookedMinutes:90,availableMinutes:120,averageAppointmentsPerWorkingDay:1,cancelled:1,expired:0});
    expect(result.bySpecialty).toEqual([{name:'Cardiology',visits:2}]);expect(result.byOffice).toEqual([{name:'Office 4',visits:2}]);
    expect(result.timeSeries).toEqual([{period:'2026-01-01',visits:1},{period:'2026-01-02',visits:1}]);
    expect(JSON.stringify(result)).not.toContain('new-patient');
  });
  it('excludes cancellations from the no-show denominator',async()=>{
    db.scheduleSlot.groupBy.mockResolvedValue([{status:'BOOKED',_count:1},{status:'OCCUPIED',_count:1}]);
    db.cancelledAppointment.count.mockResolvedValue(5);db.expiredAppointment.count.mockResolvedValue(1);
    db.$queryRawUnsafe.mockImplementation((sql:string)=>sql.includes('AS "doctorId"')?Promise.resolve([{doctorId:'doc',doctorName:'Doctor',specialty:'Care',bookedCount:1,completedCount:1,bookedMinutes:60,availableMinutes:120,utilization:0.5,averageAppointmentsPerWorkingDay:1,cancelled:5,expired:1,office:'Clinic'}]):Promise.resolve([]));
    const result=await getAdminStatistics(new Date('2026-01-01Z'),new Date('2026-01-02Z'));
    expect(result.noShowRate).toBeCloseTo(1/3);
  });
  it('returns zero utilization and no-show rate with no appointments',async()=>{
    db.scheduleSlot.groupBy.mockResolvedValue([]);db.$queryRawUnsafe.mockResolvedValue([]);
    db.cancelledAppointment.count.mockResolvedValue(0);db.expiredAppointment.count.mockResolvedValue(0);
    const result=await getAdminStatistics(new Date('2026-01-01Z'),new Date('2026-01-02Z'));
    expect(result.utilization).toBe(0);expect(result.noShowRate).toBe(0);expect(result.totalVisits).toBe(0);
  });
});


describe('persisted data quality checks',()=>{
  it('runs the complete ID-only registry and stores sample IDs with counts',async()=>{
    db.$queryRawUnsafe.mockResolvedValue([{id:'record-id-only',total:1}]);
    db.integrityRun.create.mockResolvedValue({id:'run-1'});
    db.integrityRun.update.mockImplementation(async({data}:{data:{results?:unknown}})=>({id:'run-1',finishedAt:new Date(),...data}));
    const result=await runAndStoreIntegrity();
    expect(result.checks).toHaveLength(16);
    expect(result.checks.every(check=>check.count===1&&check.sampleIds[0]==='record-id-only')).toBe(true);
    expect(db.integrityRun.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'complete',results:expect.arrayContaining([expect.objectContaining({id:'medical-entry-sequence-gap',sampleIds:['record-id-only']})])})}));
    expect(JSON.stringify(result.checks)).not.toContain('Synthetic note');
  });
  it('marks clean checks informational and keeps the description and empty sample',async()=>{
    db.$queryRawUnsafe.mockResolvedValue([]);
    const checks=await collectIntegrityChecks();
    expect(checks).toHaveLength(16);
    expect(checks.every(check=>check.count===0&&check.severity==='info'&&check.sampleIds.length===0)).toBe(true);
    expect(checks.find(check=>check.id==='duplicate-medical-entry')?.description).toContain('five minutes');
  });
});
