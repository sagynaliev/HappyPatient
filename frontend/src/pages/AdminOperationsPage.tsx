import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AdminStat } from '../components/AdminStat';
import { toast } from '../lib/toast';
import { Icon } from '../components/Icons';
import '../styles/adminOperations.css';

type Kind = 'visit'|'treatment'|'parking';
type Category = {id:string;name:string;active:boolean;_count:{doctors:number}};
type DoctorChoice = {id:string;name:string;locationId:string|null;office:string|null};
type Location = {id:string;name:string;kind:'city'|'floor'|'office';parentId:string|null;parent:{name:string}|null;active:boolean;_count:{doctors:number};usage?:{doctors:number;slots:number};children:Location[]};
type Audit = {id:string;action:string;createdAt:string;actor:{firstName:string;lastName:string}|null;oldValue:unknown;newValue:unknown};
type ReferenceAudit = {id:string;entity:string;entityId:string;action:string;createdAt:string;actor:{firstName:string;lastName:string}|null;oldValue:unknown;newValue:unknown};
type Rule = {id:string;kind:Kind;amountKzt:number;ratePerHourKzt:number|null;freeMinutes:number;rounding:string;dailyCapKzt:number|null;effectiveFrom:string;effectiveTo:string|null;active:boolean;doctorId:string|null;categoryId:string|null;consultationType:string|null;serviceCode:string|null;serviceName:string|null;category:{name:string}|null;office:{name:string}|null;createdBy:{firstName:string;lastName:string}|null;audits:Audit[]};
type Check = {id:string;name:string;description:string;count:number;severity:'info'|'warning'|'critical';sampleIds:string[]};
type AccessAttempt = {id:string;createdAt:string;actor:string|null;actorRole:string|null;action:string;patient:string|null};
type Run = {id:string;startedAt:string;finishedAt:string|null;status:string;results:Check[]|null};
type Stats = {period?:string;totalVisits:number;utilization:number;noShowRate:number;newPatients:number;returningPatients:number;timeSeries:{period:string;visits:number}[];bySpecialty:{name:string;visits:number}[];byOffice:{name:string;visits:number}[];doctorWorkload:{doctorId:string;doctorName:string;specialty:string;bookedCount:number;completedCount:number;bookedMinutes:number;availableMinutes:number;utilization:number;averageAppointmentsPerWorkingDay:number;cancelled?:number;expired?:number}[]};
const money=(n:number)=>new Intl.NumberFormat('en-US').format(n)+' KZT';
const dateTimeLabel=(value:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',hourCycle:'h23',timeZone:'Asia/Almaty'}).format(new Date(value));
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Asia/Almaty'}).format(new Date(value));
const localDateTime=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty'}).format(new Date());
const priorDay=(value:string,days:number)=>{const date=new Date(value+'T12:00:00+05:00');date.setUTCDate(date.getUTCDate()-days);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty'}).format(date);};
const isoStart=(date:string)=>new Date(date+'T00:00:00+05:00').toISOString();
const isoEnd=(date:string)=>new Date(date+'T00:00:00+05:00').toISOString();
const kindNames:Record<Kind,string>={visit:'Visit',treatment:'Treatment',parking:'Parking'};
const roleNames:Record<string,string>={PATIENT:'Patient',DOCTOR:'Doctor',ADMIN:'Administrator',FRONT_DESK:'Front desk'};
const accessActions:Record<string,string>={list:'View history',get:'Open a record',export:'Export history',create:'Add a note',update:'Edit a note'};
const checkName=(id:string)=>id.replace(/-/g,' ');
const ruleIsActive=(rule:Rule)=>rule.active&&(!rule.effectiveTo||Date.parse(rule.effectiveTo)>Date.now());

export default function AdminOperationsPage({view}:{view:'pricing'|'statistics'|'integrity'|'reference'}) {
  const [rules,setRules]=useState<Rule[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [doctors,setDoctors]=useState<DoctorChoice[]>([]);
  const [referenceDoctors,setReferenceDoctors]=useState<DoctorChoice[]>([]);
  const [locations,setLocations]=useState<Location[]>([]);
  const [referenceAudits,setReferenceAudits]=useState<ReferenceAudit[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [attempts,setAttempts]=useState<{lastWeek:number;attempts:AccessAttempt[]}|null>(null);
  const [stats,setStats]=useState<Stats|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState<'categories'|'locations'>('categories');
  const [kindFilter,setKindFilter]=useState<'all'|Kind>('all');
  const [activeFilter,setActiveFilter]=useState<'all'|'active'|'inactive'>('all');
  const [from,setFrom]=useState(priorDay(today(),6));
  const [to,setTo]=useState(today());
  const [period,setPeriod]=useState<'day'|'week'|'month'>('day');
  const [workloadSort,setWorkloadSort]=useState<'bookedMinutes'|'utilization'|'doctorName'>('bookedMinutes');
  const [kind,setKind]=useState<Kind>('visit');
  const [amount,setAmount]=useState('');
  const [rate,setRate]=useState('');
  const [freeMinutes,setFreeMinutes]=useState('0');
  // Empty means no daily maximum.
  const [dailyCap,setDailyCap]=useState('');
  const [rounding,setRounding]=useState<'per_started_hour'|'per_minute'>('per_started_hour');
  const [effectiveFrom,setEffectiveFrom]=useState(localDateTime(new Date()));
  const [editing,setEditing]=useState<Rule|null>(null);
  const [formError,setFormError]=useState('');
  const [confirmingRule,setConfirmingRule]=useState<string|null>(null);
  const [locationKind,setLocationKind]=useState<'city'|'floor'|'office'>('city');
  const [locationName,setLocationName]=useState('');
  const [parentId,setParentId]=useState('');
  const [doctorId,setDoctorId]=useState('');
  const [categoryId,setCategoryId]=useState('');
  const [consultationType,setConsultationType]=useState('');
  const [serviceCode,setServiceCode]=useState('');
  const [serviceName,setServiceName]=useState('');
  const [officeId,setOfficeId]=useState('');
  const [categoryName,setCategoryName]=useState('');
  const [editingCategory,setEditingCategory]=useState<Category|null>(null);
  const [editingLocation,setEditingLocation]=useState<Location|null>(null);

  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try {
      if(view==='pricing') { const [r,c,d,l]=await Promise.all([api<{rules:Rule[]}>('/admin/pricing'),api<{categories:Category[]}>('/admin/reference/categories'),api<{doctors:DoctorChoice[]}>('/admin/doctors'),api<{locations:Location[]}>('/admin/reference/locations')]);setRules(r.rules);setCategories(c.categories);setDoctors(d.doctors);setLocations(l.locations); }
      if(view==='statistics') {
        if(!from||!to) throw new Error('Choose both dates.');
        const end=new Date(to+'T12:00:00+05:00');end.setUTCDate(end.getUTCDate()+1);
        setStats(await api<Stats>('/admin/statistics?from='+encodeURIComponent(isoStart(from))+'&to='+encodeURIComponent(end.toISOString())+'&period='+period));
      }
      if(view==='integrity') {
        const [r,a]=await Promise.all([api<{runs:Run[]}>('/admin/integrity/runs'),api<{lastWeek:number;attempts:AccessAttempt[]}>('/admin/security/access-attempts').catch(()=>null)]);
        setRuns(r.runs);setAttempts(a&&Array.isArray(a.attempts)?a:null);
      }
      if(view==='reference') {
        const [c,l,d,a]=await Promise.all([api<{categories:Category[]}>('/admin/reference/categories'),api<{locations:Location[]}>('/admin/reference/locations'),api<{doctors:DoctorChoice[]}>('/admin/doctors'),api<{audits:ReferenceAudit[]}>('/admin/reference/audit')]);
        setCategories(c.categories);setLocations(l.locations);setReferenceDoctors(d.doctors);setReferenceAudits(a.audits);
      }
    } catch {setError('Could not load this information. Retry.');}
    finally {setBusy(false);}
  },[view,from,to,period]);
  useEffect(()=>{void load()},[load]);

  function startEdit(rule:Rule) {
    setEditing(rule);setKind(rule.kind);setDoctorId(rule.doctorId??'');setCategoryId(rule.categoryId??'');setConsultationType(rule.consultationType??'');setServiceCode(rule.serviceCode??'');setServiceName(rule.serviceName??'');setFormError('');setOfficeId(rule.office?.name?locations.find(item=>item.name===rule.office?.name)?.id??'':'');setAmount(String(rule.amountKzt));setRate(String(rule.ratePerHourKzt??''));setFreeMinutes(String(rule.freeMinutes));setDailyCap(rule.dailyCapKzt===null||rule.dailyCapKzt===undefined?'':String(rule.dailyCapKzt));setRounding(rule.rounding as 'per_started_hour'|'per_minute');setEffectiveFrom(localDateTime(new Date()));
  }
  async function saveRule(event:FormEvent) {
    event.preventDefault();setError('');setFormError('');
    // Parking is priced by the hourly rate; its flat amount is not used.
    const flatAmount=kind==='parking'?0:Number(amount);
    if(kind!=='parking'&&(amount.trim()===''||!Number.isInteger(flatAmount)||flatAmount<0)){setFormError('Enter the amount as a whole number of KZT (0 or more).');return;}
    if(kind==='parking'&&(rate.trim()===''||!Number.isInteger(Number(rate))||Number(rate)<0)){setFormError('Enter the hourly parking rate as a whole number of KZT (0 or more).');return;}
    if(kind==='parking'&&dailyCap.trim()!==''&&(!Number.isInteger(Number(dailyCap))||Number(dailyCap)<0)){setFormError('Enter the daily cap as a whole number of KZT, or leave it empty for no cap.');return;}
    if(editing&&(editing.doctorId||editing.categoryId)&&!window.confirm('This change affects existing doctors. Save it as a new price version?'))return;
    const body={kind,amountKzt:flatAmount,ratePerHourKzt:kind==='parking'?Number(rate):null,freeMinutes:Number(freeMinutes),rounding,dailyCapKzt:kind==='parking'&&dailyCap.trim()!==''?Number(dailyCap):null,effectiveFrom:new Date(effectiveFrom).toISOString(),effectiveTo:null,doctorId:kind==='visit'?(doctorId||null):null,categoryId:kind==='visit'?(categoryId||null):null,consultationType:kind==='visit'?(consultationType||null):null,serviceCode:kind==='treatment'?(serviceCode||null):null,serviceName:kind==='treatment'?(serviceName||null):null,officeId:kind==='parking'?(officeId||null):null};
    try{await api(editing?'/admin/pricing/'+encodeURIComponent(editing.id):'/admin/pricing',{method:editing?'PATCH':'POST',body:JSON.stringify(body)});setEditing(null);setDoctorId('');setCategoryId('');setConsultationType('');setServiceCode('');setServiceName('');setOfficeId('');setAmount('');setRate('');setDailyCap('');toast.success(editing?'New price version saved':'Pricing rule added');await load();}
    catch(caught){const message=caught instanceof Error&&caught.message?caught.message:'The pricing rule could not be saved.';setFormError(message);toast.error('Pricing rule not saved',message);}
  }
  async function deactivate(rule:Rule) {
    setConfirmingRule(null);
    try{await api('/admin/pricing/'+encodeURIComponent(rule.id),{method:'PATCH',body:JSON.stringify({active:false})});toast.neutral('Pricing rule deactivated','Bookings made while it was active keep their price.');await load();}
    catch{setError('This rule could not be deactivated.');}
  }
  async function saveCategory(event:FormEvent){event.preventDefault();try{await api(editingCategory?'/admin/reference/categories/'+encodeURIComponent(editingCategory.id):'/admin/reference/categories',{method:editingCategory?'PATCH':'POST',body:JSON.stringify({name:categoryName})});setCategoryName('');setEditingCategory(null);await load();}catch{setError('Category could not be saved. It may already exist.');}}
  async function toggleCategory(item:Category){if(!window.confirm((item.active?'Deactivate':'Reactivate')+' '+item.name+'? '+item._count.doctors+' doctor profiles are linked.'))return;try{await api('/admin/reference/categories/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({active:!item.active})});await load();}catch{setError('Category could not be updated.');}}
  function editCategory(item:Category){setEditingCategory(item);setCategoryName(item.name);}
  function resetLocationForm(){setEditingLocation(null);setLocationKind('city');setLocationName('');setParentId('');}
  function editLocation(item:Location){setEditingLocation(item);setLocationKind(item.kind);setLocationName(item.name);setParentId(item.parentId??'');}
  async function saveLocation(event:FormEvent){event.preventDefault();const moving=Boolean(editingLocation&&parentId!==(editingLocation.parentId??''));if(moving&&!window.confirm('Move this location and update linked doctor profiles?'))return;try{const body=editingLocation?{name:locationName,parentId:parentId||null,confirmMove:moving}:{name:locationName,kind:locationKind,parentId:parentId||null};await api(editingLocation?'/admin/reference/locations/'+encodeURIComponent(editingLocation.id):'/admin/reference/locations',{method:editingLocation?'PATCH':'POST',body:JSON.stringify(body)});resetLocationForm();await load();}catch{setError('Location could not be saved. Check the parent and duplicate name.');}}
  async function assignDoctor(doctor:DoctorChoice,locationId:string){try{await api('/admin/doctors/'+encodeURIComponent(doctor.id)+'/location',{method:'PATCH',body:JSON.stringify({locationId:locationId||null})});await load();}catch{setError('Office assignment could not be saved.');}}
  async function toggleLocation(item:Location){const action=item.active?'Deactivate':'Reactivate';if(!window.confirm(action+' '+item.kind+' '+item.name+'? '+(item.usage?.doctors??item._count.doctors)+' linked doctors and '+(item.usage?.slots??0)+' schedule slots are affected.'))return;try{await api('/admin/reference/locations/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({active:!item.active})});await load();}catch{setError('Deactivate active child locations first.');}}

  async function runIntegrity() {
    setBusy(true);setError('');
    try { await api('/admin/integrity/run',{method:'POST'}); setRuns((await api<{runs:Run[]}>('/admin/integrity/runs')).runs); }
    catch { setError('The integrity checks could not be completed. Retry.'); }
    finally { setBusy(false); }
  }
  const title={pricing:'Pricing rules',statistics:'Visit statistics',integrity:'Data quality and integrity',reference:'Reference data'}[view];
  const parents=locations.filter(item=>item.active&&(locationKind==='floor'?item.kind==='city':locationKind==='office'?item.kind==='floor'&&Boolean(locations.find(parent=>parent.id===item.parentId)?.active):false));
  const visibleRules=rules.filter(item=>(kindFilter==='all'||item.kind===kindFilter)&&(activeFilter==='all'||ruleIsActive(item)===(activeFilter==='active')));
  const maxVisits=Math.max(1,...(stats?.timeSeries??[]).map(item=>item.visits));
  const sortedWorkload=stats?.doctorWorkload.slice().sort((a,b)=>workloadSort==='doctorName'?a.doctorName.localeCompare(b.doctorName):Number(b[workloadSort])-Number(a[workloadSort]))??[];
  const latestRun=runs.find(run=>run.status==='complete'&&Array.isArray(run.results));
  const previousRun=latestRun?runs.slice(runs.indexOf(latestRun)+1).find(run=>run.status==='complete'&&Array.isArray(run.results)):undefined;
  const latestChecks=latestRun?.results??[];
  const passedChecks=latestChecks.filter(check=>check.count===0).length;
  const warningChecks=latestChecks.filter(check=>check.count>0&&check.severity==='warning').length;
  const criticalChecks=latestChecks.filter(check=>check.count>0&&check.severity==='critical').length;
  const subtitle={pricing:'Visit, treatment and parking prices. Each change is versioned and audited.',statistics:'Doctor workload and patient visits for the selected period (Asia/Almaty).',integrity:'Automatic checks for missing, broken or misordered records. Samples show record IDs only.',reference:'Specialties and the city → floor → office structure used across the platform.'}[view];
  const severityRank=(check:Check)=>check.severity==='critical'?0:check.severity==='warning'?1:2;
  const problemChecks=latestChecks.filter(check=>check.count>0).sort((a,b)=>severityRank(a)-severityRank(b)||b.count-a.count);
  const passedList=latestChecks.filter(check=>check.count===0);
  const severityPill=(check:Check)=>check.count===0?<span className="admin-status admin-status-active">Passed</span>:check.severity==='critical'?<span className="admin-status admin-status-danger">Critical</span>:check.severity==='warning'?<span className="admin-status admin-status-amber">Warning</span>:<span className="admin-status admin-status-muted">Info</span>;
  const checkTable=(checks:Check[])=><div className="table-wrap"><table className="admin-table is-wide"><thead><tr><th>Check</th><th>Records</th><th>Trend</th><th>Result</th><th>Sample IDs</th></tr></thead><tbody>{checks.map(check=>{const prior=previousRun?.results?.find(item=>item.id===check.id);const delta=prior?check.count-prior.count:null;return <tr key={check.id}><td><strong>{check.name??checkName(check.id)}</strong><small>{check.description??''}</small></td><td>{check.count}</td><td>{delta===null?'—':delta===0?'No change':delta>0?'+'+delta:String(delta)}</td><td>{severityPill(check)}</td><td>{check.sampleIds?.length?<details><summary>{plural(check.sampleIds.length,'ID')}</summary><ul className="ad-id-list">{check.sampleIds.map(id=><li key={id}><code>{id}</code></li>)}</ul></details>:'—'}</td></tr>})}</tbody></table></div>;
  return <div className="admin-page ad-page ad-ops">
    <header className="ad-head">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="ad-head-actions">
        <button className="ad-button ad-button-outline" type="button" onClick={()=>void load()} disabled={busy}><Icon name="refresh" size={18}/> Refresh</button>
        {view==='integrity'&&<button className="ad-button" type="button" onClick={()=>void runIntegrity()} disabled={busy}><Icon name="shield" size={18}/> {busy?'Running checks…':'Run checks now'}</button>}
      </div>
    </header>
    {error&&<div className="admin-alert ad-ops-alert" role="alert"><span>{error}</span><button className="ad-mini" type="button" onClick={()=>void load()}>Retry</button></div>}
    {busy&&<p className="sr-only" role="status">Loading…</p>}

    {view==='pricing'&&<>
      <section className="admin-metrics-grid ad-stats" aria-label="Pricing summary">
        <AdminStat icon="stethoscope" tone="is-blue" label="Visit rules" value={rules.filter(item=>item.kind==='visit'&&ruleIsActive(item)).length} note="Active now"/>
        <AdminStat icon="file" tone="is-violet" label="Treatment rules" value={rules.filter(item=>item.kind==='treatment'&&ruleIsActive(item)).length} note="Active now"/>
        <AdminStat icon="pin" tone="is-green" label="Parking rules" value={rules.filter(item=>item.kind==='parking'&&ruleIsActive(item)).length} note="Active now"/>
        <AdminStat icon="clock" tone="is-pink" label="Ended or inactive" value={rules.filter(item=>!ruleIsActive(item)).length} note="Kept in history"/>
      </section>
      <form className="admin-panel ad-panel ad-form" onSubmit={saveRule}>
        <div className="admin-panel-header"><div><h2>{editing?'Create a new version':'Add a pricing rule'}</h2><p className="ad-muted">{editing?'The current version stays in history; the new one starts at the date you choose.':'The most specific rule wins: a consultation type first, then doctor, specialty, global.'}</p></div></div>
        <div className="ad-form-grid">
          <label>Type<select value={kind} onChange={e=>setKind(e.target.value as Kind)}><option value="visit">Visit</option><option value="treatment">Treatment</option><option value="parking">Parking</option></select></label>
          {kind!=='parking'&&<label>Amount (KZT)<input type="number" min="0" step="1" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>}
          {kind==='parking'&&<><label>Hourly rate (KZT)<input type="number" min="0" step="1" value={rate} onChange={e=>setRate(e.target.value)} required/></label><label>Free minutes<input type="number" min="0" step="1" value={freeMinutes} onChange={e=>setFreeMinutes(e.target.value)}/></label><label>Daily cap (KZT)<input type="number" min="0" step="1" value={dailyCap} placeholder="No cap" onChange={e=>setDailyCap(e.target.value)}/></label><label>Rounding<select value={rounding} onChange={e=>setRounding(e.target.value as typeof rounding)}><option value="per_started_hour">Each started hour</option><option value="per_minute">Per minute</option></select></label></>}
          {kind==='visit'&&<><label>Doctor scope<select value={doctorId} onChange={e=>setDoctorId(e.target.value)}><option value="">Any doctor</option>{doctors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Specialty scope<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Any specialty</option>{categories.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Consultation type<select value={consultationType} onChange={e=>setConsultationType(e.target.value)}><option value="">Any consultation</option>{CONSULTATION_TYPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></>}
          {kind==='treatment'&&<><label>Service code<input value={serviceCode} onChange={e=>setServiceCode(e.target.value)} maxLength={80}/></label><label>Service name<input value={serviceName} onChange={e=>setServiceName(e.target.value)} maxLength={120}/></label></>}
          {kind==='parking'&&<label>Office scope<select value={officeId} onChange={e=>setOfficeId(e.target.value)}><option value="">All offices</option>{locations.filter(item=>isSelectableOffice(item,locations)).map(item=><option key={item.id} value={item.id}>{locationPath(item,locations)}</option>)}</select></label>}
          <label>Effective from<input type="datetime-local" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)} required/></label>
        </div>
        {formError&&<p className="ad-form-error" role="alert">{formError}</p>}
        <div className="ad-form-actions"><button className="ad-button" type="submit">{editing?'Save new version':'Add rule'}</button>{editing&&<button className="ad-button ad-button-outline" type="button" onClick={()=>{setEditing(null);setFormError('');}}>Cancel</button>}</div>
      </form>
      <section className="admin-panel ad-panel">
        <div className="admin-panel-header"><div><h2>Rules</h2><p className="ad-muted">{visibleRules.length} shown</p></div>
          <div className="ad-filters"><label>Type<select value={kindFilter} onChange={e=>setKindFilter(e.target.value as typeof kindFilter)}><option value="all">All types</option><option value="visit">Visits</option><option value="treatment">Treatments</option><option value="parking">Parking</option></select></label><label>Status<select value={activeFilter} onChange={e=>setActiveFilter(e.target.value as typeof activeFilter)}><option value="all">All rules</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
        </div>
        <div className="table-wrap"><table className="admin-table is-wide"><thead><tr><th>Type / scope</th><th>Price</th><th>Effective</th><th>Status</th><th>Created by</th><th aria-label="Actions"/></tr></thead><tbody>{visibleRules.map(rule=><tr key={rule.id}><td><strong>{kindNames[rule.kind]}</strong><small>{ruleScope(rule,doctors)}</small></td><td>{rule.kind!=='parking'?money(rule.amountKzt):rule.ratePerHourKzt!==null?<>{money(rule.ratePerHourKzt)} / {rule.rounding==='per_minute'?'hour, by the minute':'started hour'}<small>{[rule.freeMinutes?rule.freeMinutes+' min free':'No free minutes',rule.dailyCapKzt!==null?'max '+money(rule.dailyCapKzt)+' a day':'No daily cap'].join(' · ')}</small></>:'—'}</td><td>{dateLabel(rule.effectiveFrom)}{rule.effectiveTo?' – '+dateLabel(rule.effectiveTo):''}</td><td>{ruleIsActive(rule)?<span className="admin-status admin-status-active">Active</span>:rule.active?<span className="admin-status admin-status-muted">Ended</span>:<span className="admin-status admin-status-danger">Inactive</span>}</td><td>{rule.createdBy?rule.createdBy.firstName+' '+rule.createdBy.lastName:'Admin'}<small>{plural(rule.audits?.length??0,'change')} recorded</small></td><td className="ad-row-actions">{confirmingRule===rule.id?<span className="ad-confirm" role="group" aria-label="Confirm deactivation"><span>Deactivate this rule?</span><button className="ad-mini is-danger" type="button" onClick={()=>void deactivate(rule)}>Yes, deactivate</button><button className="ad-mini" type="button" onClick={()=>setConfirmingRule(null)}>Keep</button></span>:<><button className="ad-mini" type="button" onClick={()=>startEdit(rule)}>New version</button>{ruleIsActive(rule)&&<button className="ad-mini is-danger" type="button" onClick={()=>setConfirmingRule(rule.id)}>Deactivate</button>}</>}</td></tr>)}</tbody></table></div>
        {visibleRules.length===0&&<p className="ad-empty-state">No pricing rules match these filters.</p>}
      </section>
      {visibleRules.some(rule=>rule.audits?.length>0)&&<section className="admin-panel ad-panel"><div className="admin-panel-header"><div><h2>Price change history</h2><p className="ad-muted">Who changed which price and when, newest first</p></div></div><ShowMore limit={5} noun="change" items={visibleRules.flatMap(rule=>(rule.audits??[]).map(audit=>({rule,audit}))).sort((a,b)=>Date.parse(b.audit.createdAt)-Date.parse(a.audit.createdAt))} render={items=><ul className="ad-audit-list">{items.map(({rule,audit})=><li key={audit.id}><span className="ad-audit-date">{dateTimeLabel(audit.createdAt)}</span><span><strong>{audit.actor?.firstName??'Admin'} {audit.actor?.lastName??''}</strong> {auditVerb(audit.action)} {kindNames[rule.kind].toLowerCase()} price · {ruleScope(rule,doctors)}</span><small>{auditChange(rule.kind,audit.oldValue,audit.newValue)}</small></li>)}</ul>}/></section>}
    </>}

    {view==='statistics'&&<>
      <section className="admin-panel ad-panel ad-range">
        <div className="ad-segment" role="group" aria-label="Quick ranges">
          <button type="button" aria-pressed={from===priorDay(today(),6)&&to===today()} onClick={()=>{setFrom(priorDay(today(),6));setTo(today());}}>Last 7 days</button>
          <button type="button" aria-pressed={from===priorDay(today(),29)&&to===today()} onClick={()=>{setFrom(priorDay(today(),29));setTo(today());}}>Last 30 days</button>
          <button type="button" aria-pressed={from===priorDay(today(),89)&&to===today()} onClick={()=>{setFrom(priorDay(today(),89));setTo(today());}}>Last 90 days</button>
        </div>
        <div className="ad-filters"><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Group by<select value={period} onChange={e=>setPeriod(e.target.value as typeof period)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label></div>
      </section>
      {!stats&&!busy&&<p className="ad-empty-state">No statistics available for this range.</p>}
      {stats&&<>
        <section className="admin-metrics-grid ad-stats" aria-label="Visit summary">
          <AdminStat icon="calendar" tone="is-blue" label="Total visits" value={stats.totalVisits} note="Booked or checked in"/>
          <AdminStat icon="chart" tone="is-green" label="Utilization" value={Math.round(stats.utilization*100)+'%'} note="Booked of available minutes"/>
          <AdminStat icon="clock" tone="is-pink" label="No-show rate" value={Math.round(stats.noShowRate*100)+'%'} note="Released without check-in"/>
          <AdminStat icon="users" tone="is-violet" label="New / returning" value={stats.newPatients+' / '+stats.returningPatients} note="Patients in this period"/>
        </section>
        <section className="admin-panel ad-panel ad-chart-panel">
            <div className="admin-panel-header"><div><h2>Visits by {period}</h2><p className="ad-muted">{stats.totalVisits} visits in this period</p></div></div>
            {stats.totalVisits===0?<p className="ad-empty-state">No visits in the selected period.</p>:<div className="ad-bars" role="img" aria-label={'Visits by '+period+': '+stats.timeSeries.map(point=>point.period+' '+point.visits).join(', ')}>{stats.timeSeries.map(point=><div key={point.period} className="ad-bars-col"><span className="ad-bars-value">{point.visits}</span><span className="ad-bars-bar" style={{height:Math.max(4,120*point.visits/maxVisits)+'px'}}/><span className="ad-bars-label">{periodLabel(point.period,period)}</span></div>)}</div>}
            {stats.totalVisits>0&&<details className="ad-details"><summary>Show as a table</summary><DataTable headings={[period==='day'?'Date':period==='week'?'Week of':'Month','Visits']} rows={stats.timeSeries.map(row=>[periodLabel(row.period,period),String(row.visits)])}/></details>}
        </section>
        <section className="admin-panel ad-panel">
          <div className="admin-panel-header"><div><h2>Doctor workload</h2><p className="ad-muted">{sortedWorkload.length} doctors</p></div><div className="ad-filters"><label>Sort by<select value={workloadSort} onChange={event=>setWorkloadSort(event.target.value as typeof workloadSort)}><option value="bookedMinutes">Booked minutes</option><option value="utilization">Utilization</option><option value="doctorName">Name</option></select></label></div></div>
          <DataTable headings={['Doctor','Specialty','Booked','Completed','Booked min','Available min','Utilization','Per working day','Cancelled','No-show']} rows={sortedWorkload.map(row=>[row.doctorName,row.specialty,String(row.bookedCount),String(row.completedCount),String(row.bookedMinutes),String(row.availableMinutes),Math.round(row.utilization*100)+'%',row.averageAppointmentsPerWorkingDay.toFixed(1),String(row.cancelled??0),String(row.expired??0)])} wide/>
        </section>
        <section className="ad-grid ad-grid-even">
          <section className="admin-panel ad-panel"><div className="admin-panel-header"><div><h2>By specialty</h2></div></div><MiniBars label="Visits by specialty" values={stats.bySpecialty}/></section>
          <section className="admin-panel ad-panel"><div className="admin-panel-header"><div><h2>By office</h2></div></div><MiniBars label="Visits by office or location" values={stats.byOffice}/></section>
        </section>
      </>}
    </>}

    {view==='integrity'&&<>
      <section className="admin-metrics-grid ad-stats ad-stats-3" aria-label="Latest run summary">
        <AdminStat icon="check" tone="is-green" label="Checks passed" value={passedChecks} note={latestChecks.length?'of '+latestChecks.length+' checks':'No run yet'}/>
        <AdminStat icon="warning" tone="is-amber" label="Warnings" value={warningChecks} note="Worth reviewing"/>
        <AdminStat icon="ban" tone="is-pink" label="Critical" value={criticalChecks} note="Fix as soon as possible"/>
      </section>
      {runs.length===0&&!busy&&<p className="ad-empty-state">No integrity runs recorded yet. Run the checks to see results.</p>}
      {latestRun&&<section className="admin-panel ad-panel">
        <div className="admin-panel-header"><div><h2>Latest run</h2><p className="ad-muted">{dateTimeLabel(latestRun.startedAt)} · problems first · trend compared with the run before it</p></div></div>
        {problemChecks.length===0&&<p className="ad-empty-state">Every check passed. Nothing needs attention.</p>}
        {problemChecks.length>0&&checkTable(problemChecks)}
        {passedList.length>0&&<details className="ad-details"><summary>{plural(passedList.length,'passed check')}</summary>{checkTable(passedList)}</details>}
      </section>}
      {runs.length>0&&<section className="admin-panel ad-panel"><div className="admin-panel-header"><div><h2>Run history</h2><p className="ad-muted">Newest first · last {runs.length}</p></div></div><ul className="ad-run-list">{runs.map(run=>{const results=Array.isArray(run.results)?run.results:[];const failing=results.filter(check=>check.count>0);const critical=failing.filter(check=>check.severity==='critical').length;return <li key={run.id}><span className="ad-audit-date">{dateTimeLabel(run.startedAt)}</span>{run===latestRun&&<span className="admin-status admin-status-muted">Latest</span>}{run.status!=='complete'||!results.length?<span className={`admin-status ${run.status==='failed'?'admin-status-danger':'admin-status-amber'}`}>{run.status==='failed'?'Failed · no results':run.status==='running'?'Running or interrupted':'No results'}</span>:<><span>{results.length-failing.length} of {results.length} passed</span>{critical?<span className="admin-status admin-status-danger">{critical} critical</span>:failing.length?<span className="admin-status admin-status-amber">{failing.length} to review</span>:<span className="admin-status admin-status-active">All clear</span>}</>}</li>})}</ul></section>}
      {attempts&&<section className="admin-panel ad-panel" aria-labelledby="access-attempts-heading">
        <div className="admin-panel-header"><div><h2 id="access-attempts-heading">Refused medical-record access</h2><p className="ad-muted">Attempts to open or change a record without permission · {attempts.lastWeek} in the last 7 days · record content is never stored</p></div></div>
        {attempts.attempts.length===0?<p className="ad-empty-state">No refused attempts recorded.</p>:<div className="table-wrap"><table className="admin-table is-wide"><thead><tr><th>When</th><th>Who</th><th>Role</th><th>Action</th><th>Patient record</th></tr></thead><tbody>{attempts.attempts.map(item=><tr key={item.id}><td>{dateTimeLabel(item.createdAt)}</td><td>{item.actor??'Not signed in'}</td><td>{item.actorRole?roleNames[item.actorRole]??item.actorRole:'—'}</td><td>{accessActions[item.action]??item.action}</td><td>{item.patient??'Unknown'}</td></tr>)}</tbody></table></div>}
      </section>}
    </>}

    {view==='reference'&&<>
      <div className="ad-segment" role="tablist" aria-label="Reference data">
        <button type="button" role="tab" aria-selected={tab==='categories'} aria-pressed={tab==='categories'} onClick={()=>setTab('categories')}>Doctor categories</button>
        <button type="button" role="tab" aria-selected={tab==='locations'} aria-pressed={tab==='locations'} onClick={()=>setTab('locations')}>Office locations</button>
      </div>
      {tab==='categories'&&<section className="admin-panel ad-panel">
        <div className="admin-panel-header"><div><h2>Doctor categories</h2><p className="ad-muted">{categories.filter(item=>item.active).length} active · inactive ones are hidden from doctor search</p></div>
          <form className="ad-inline-form" onSubmit={saveCategory}><label className="sr-only" htmlFor="ad-category-name">{editingCategory?'Edit category':'New category'}</label><input id="ad-category-name" value={categoryName} onChange={e=>setCategoryName(e.target.value)} minLength={2} maxLength={80} required placeholder={editingCategory?'Category name':'New category name'}/><button className="ad-button" type="submit">{editingCategory?'Save':'Add category'}</button>{editingCategory&&<button className="ad-button ad-button-outline" type="button" onClick={()=>{setEditingCategory(null);setCategoryName('')}}>Cancel</button>}</form>
        </div>
        <div className="table-wrap"><table className="admin-table"><thead><tr><th>Category</th><th>Doctors</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>{categories.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item._count.doctors}</td><td>{item.active?<span className="admin-status admin-status-active">Active</span>:<span className="admin-status admin-status-muted">Inactive</span>}</td><td className="ad-row-actions"><button className="ad-mini" type="button" onClick={()=>editCategory(item)}>Edit</button><button className={`ad-mini${item.active?' is-danger':''}`} type="button" onClick={()=>void toggleCategory(item)}>{item.active?'Deactivate':'Reactivate'}</button></td></tr>)}</tbody></table></div>
      </section>}
      {tab==='locations'&&<>
        <form className="admin-panel ad-panel ad-form" onSubmit={saveLocation}>
          <div className="admin-panel-header"><div><h2>{editingLocation?'Edit location':'Add a location'}</h2><p className="ad-muted">A floor belongs to a city, an office belongs to a floor.</p></div></div>
          <div className="ad-form-grid"><label>Level<select disabled={Boolean(editingLocation)} value={locationKind} onChange={e=>{setLocationKind(e.target.value as typeof locationKind);setParentId('')}}><option value="city">City</option><option value="floor">Floor</option><option value="office">Office</option></select></label><label>Name<input value={locationName} onChange={e=>setLocationName(e.target.value)} maxLength={120} required/></label>{locationKind!=='city'&&<label>Parent<select value={parentId} onChange={e=>setParentId(e.target.value)} required><option value="">Choose parent</option>{parents.filter(item=>item.id!==editingLocation?.id).map(item=><option key={item.id} value={item.id}>{item.kind}: {item.name}</option>)}</select></label>}</div>
          <div className="ad-form-actions"><button className="ad-button" type="submit">{editingLocation?'Save location':'Add location'}</button>{editingLocation&&<button className="ad-button ad-button-outline" type="button" onClick={resetLocationForm}>Cancel</button>}</div>
        </form>
        <section className="ad-grid ad-grid-even">
          <LocationTree locations={locations} onEdit={editLocation} onToggle={item=>void toggleLocation(item)}/>
          <section className="admin-panel ad-panel"><div className="admin-panel-header"><div><h2>Doctor office assignments</h2><p className="ad-muted">{referenceDoctors.filter(doctor=>doctor.locationId).length} of {referenceDoctors.length} assigned</p></div></div><div className="table-wrap ad-scroll"><table className="admin-table"><thead><tr><th>Doctor</th><th>Office</th></tr></thead><tbody>{referenceDoctors.map(doctor=><tr key={doctor.id}><td>{doctor.name}</td><td><select className="ad-select" aria-label={'Office for '+doctor.name} value={doctor.locationId??''} onChange={event=>void assignDoctor(doctor,event.target.value)}><option value="">Unassigned</option>{locations.filter(item=>isSelectableOffice(item,locations)).map(item=><option key={item.id} value={item.id}>{locationPath(item,locations)}</option>)}</select></td></tr>)}</tbody></table></div></section>
        </section>
      </>}
      <section className="admin-panel ad-panel"><div className="admin-panel-header"><div><h2>Recent reference changes</h2><p className="ad-muted">Audit trail for categories and locations</p></div></div>{referenceAudits.length===0?<p className="ad-empty-state">No changes recorded yet.</p>:<ShowMore limit={6} noun="change" items={referenceAudits} render={items=><ul className="ad-audit-list">{items.map(audit=><li key={audit.id}><span className="ad-audit-date">{dateLabel(audit.createdAt)}</span><span><strong>{audit.actor?audit.actor.firstName+' '+audit.actor.lastName:'Admin'}</strong> {referenceAction(audit.action,audit.entity)}</span><small>{referenceChange(audit.oldValue,audit.newValue)}</small></li>)}</ul>}/>}</section>
    </>}
  </div>;
}

function referenceChange(oldValue:unknown,newValue:unknown) {
  const read=(value:unknown)=>{if(!value||typeof value!=='object')return '';const record=value as {name?:unknown;active?:unknown};return [record.name!==undefined?String(record.name):'',record.active!==undefined?(record.active?'active':'inactive'):''].filter(Boolean).join(', ');};
  const before=read(oldValue);const after=read(newValue);
  return before?before+' → '+after:after;
}

const plural=(count:number,noun:string)=>`${count} ${noun}${count===1?'':'s'}`;
/** Consultation types a visit price can target; the most specific matching one wins. */
const CONSULTATION_TYPE_OPTIONS:Array<[string,string]>=[['first','First visit'],['follow-up','Follow-up visit'],['in-person','In-person'],['online','Online'],['in-person:first','In-person · First visit'],['in-person:follow-up','In-person · Follow-up visit'],['online:first','Online · First visit'],['online:follow-up','Online · Follow-up visit']];
const consultationTypeName=(value:string|null)=>value?CONSULTATION_TYPE_OPTIONS.find(([key])=>key===value)?.[1]??value:'';
const ruleScope=(rule:Rule,doctors:DoctorChoice[])=>{const base=rule.serviceName??rule.category?.name??doctors.find(item=>item.id===rule.doctorId)?.name??rule.office?.name??(rule.kind==='parking'?'All offices':'All doctors');return rule.kind==='visit'&&rule.consultationType?`${base} · ${consultationTypeName(rule.consultationType)}`:base;};
function parkingTerms(rule:{ratePerHourKzt:number|null;freeMinutes:number;rounding:string;dailyCapKzt:number|null}) {
  if(rule.ratePerHourKzt===null)return '—';
  return [money(rule.ratePerHourKzt)+(rule.rounding==='per_minute'?' / hour, by the minute':' / started hour'),rule.freeMinutes?rule.freeMinutes+' min free':'',rule.dailyCapKzt!==null?'max '+money(rule.dailyCapKzt)+' a day':''].filter(Boolean).join(' · ');
}
const auditVerb=(action:string)=>({created:'added a',updated:'changed a',deactivated:'deactivated a',versioned:'added a new version of a'} as Record<string,string>)[action]??action+' a';
/** Plain-language price change, e.g. "14,000 KZT → 15,000 KZT". */
function auditChange(kind:Kind,oldValue:unknown,newValue:unknown) {
  const read=(value:unknown)=>{
    if(!value||typeof value!=='object')return '';
    const record=value as {amountKzt?:number;ratePerHourKzt?:number|null;freeMinutes?:number;rounding?:string;dailyCapKzt?:number|null;active?:boolean};
    if(kind==='parking')return parkingTerms({ratePerHourKzt:record.ratePerHourKzt??null,freeMinutes:record.freeMinutes??0,rounding:record.rounding??'per_started_hour',dailyCapKzt:record.dailyCapKzt??null});
    return typeof record.amountKzt==='number'?money(record.amountKzt):'';
  };
  const before=read(oldValue);const after=read(newValue);
  if(!before)return after?'Price: '+after:'';
  return before===after?'Price unchanged: '+after:before+' → '+after;
}
function referenceAction(action:string,entity:string) {
  if(entity==='doctor-office')return action==='chosen-by-doctor'?'chose their own office':'assigned a doctor\'s office';
  const thing=entity==='category'?'a specialty':entity==='location'?'a location':entity;
  const verb=({created:'added',renamed:'renamed',moved:'moved',updated:'updated',deactivated:'deactivated',reactivated:'reactivated'} as Record<string,string>)[action]??action;
  return verb+' '+thing;
}
function periodLabel(value:string,period:'day'|'week'|'month') {
  if(/^\d{4}-\d{2}$/.test(value))return new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z'));
  if(/^\d{4}-\d{2}-\d{2}/.test(value)){const label=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T00:00:00Z'));return period==='month'?new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value.slice(0,10)+'T00:00:00Z')):label;}
  return value;
}
/** Shows the first `limit` items with a button for the rest, so long lists don't stretch the page. */
function ShowMore<T>({items,limit,noun,render}:{items:T[];limit:number;noun:string;render:(items:T[])=>ReactNode}) {
  const [all,setAll]=useState(false);
  const shown=all?items:items.slice(0,limit);
  return <>{render(shown)}{items.length>limit&&<button className="ad-mini ad-show-more" type="button" aria-expanded={all} onClick={()=>setAll(value=>!value)}>{all?'Show fewer':`Show all ${plural(items.length,noun)}`}</button>}</>;
}

function MiniBars({label,values}:{label:string;values:{name:string;visits:number}[]}) {const max=Math.max(1,...values.map(item=>item.visits));if(values.length===0)return <p className="ad-empty-state">No visits in this period.</p>;return <figure className="ad-mini-chart" aria-label={label}><ShowMore limit={8} noun="row" items={values} render={items=><ul>{items.map(item=><li key={item.name}><span>{item.name}</span><span className="ad-bar-track"><span className="ad-bar" style={{width:(item.visits/max*100)+'%'}}/></span><strong>{item.visits}</strong></li>)}</ul>}/></figure>;}

function DataTable({headings,rows,renderRows,wide}:{headings:string[];rows:string[][];renderRows?:ReactNode;wide?:boolean}) {
  return <div className={`table-wrap${wide?' ad-scroll':''}`}><table className={`admin-table${wide?' is-wide':''}`}><thead><tr>{headings.map(item=><th key={item}>{item}</th>)}</tr></thead><tbody>{renderRows??rows.map((row,index)=><tr key={index}>{row.map((value,cell)=><td key={cell}>{value}</td>)}</tr>)}</tbody></table>{rows.length===0&&<p className="ad-empty-state">No records available.</p>}</div>;
}

function isSelectableOffice(item:Location,locations:Location[]) {
  if(item.kind!=='office'||!item.active)return false;
  const floor=locations.find(location=>location.id===item.parentId);
  const city=floor?.parentId?locations.find(location=>location.id===floor.parentId):undefined;
  return Boolean(floor?.active&&city?.active);
}
function locationPath(item:Location,locations:Location[]) {
  const parts=[item.name];let parentId=item.parentId;
  while(parentId){const parent=locations.find(location=>location.id===parentId);if(!parent)break;parts.unshift(parent.name);parentId=parent.parentId;}
  return parts.join(' · ');
}
function LocationTree({locations,onEdit,onToggle}:{locations:Location[];onEdit:(item:Location)=>void;onToggle:(item:Location)=>void}) {
  const children=(parentId:string|null)=>locations.filter(item=>item.parentId===parentId);
  const countUsage=(item:Location)=>children(item.id).reduce((sum,child)=>({doctors:sum.doctors+(child.usage?.doctors??child._count.doctors),slots:sum.slots+(child.usage?.slots??0)}),{doctors:item.usage?.doctors??item._count.doctors,slots:item.usage?.slots??0});
  const node=(item:Location):ReactNode=><li key={item.id}><details open={item.kind==='city'}><summary><span className="ad-loc-kind">{item.kind}</span><strong>{item.name}</strong><small>{countUsage(item).doctors} doctors · {countUsage(item).slots} slots</small>{item.active?<span className="admin-status admin-status-active">Active</span>:<span className="admin-status admin-status-muted">Inactive</span>}</summary><div className="ad-location-actions"><button className="ad-mini" type="button" onClick={()=>onEdit(item)}>Edit</button><button className={`ad-mini${item.active?' is-danger':''}`} type="button" onClick={()=>onToggle(item)}>{item.active?'Deactivate':'Reactivate'}</button></div>{children(item.id).length>0&&<ul>{children(item.id).map(node)}</ul>}</details></li>;
  return <section className="admin-panel ad-panel ad-location-tree" aria-label="Office locations"><div className="admin-panel-header"><div><h2>City → floor → office</h2><p className="ad-muted">Open a level to edit it</p></div></div><ul>{children(null).filter(item=>item.kind==='city').map(node)}</ul>{children(null).filter(item=>item.kind!=='city').map(node)}</section>;
}
