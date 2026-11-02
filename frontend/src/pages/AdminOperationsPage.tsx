import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Kind = 'visit'|'treatment'|'parking';
type Category = {id:string;name:string;active:boolean;_count:{doctors:number}};
type DoctorChoice = {id:string;name:string;locationId:string|null;office:string|null};
type Location = {id:string;name:string;kind:'city'|'floor'|'office';parentId:string|null;parent:{name:string}|null;active:boolean;_count:{doctors:number};usage?:{doctors:number;slots:number};children:Location[]};
type Audit = {id:string;action:string;createdAt:string;actor:{firstName:string;lastName:string}|null;oldValue:unknown;newValue:unknown};
type ReferenceAudit = {id:string;entity:string;entityId:string;action:string;createdAt:string;actor:{firstName:string;lastName:string}|null;oldValue:unknown;newValue:unknown};
type Rule = {id:string;kind:Kind;amountKzt:number;ratePerHourKzt:number|null;freeMinutes:number;rounding:string;dailyCapKzt:number|null;effectiveFrom:string;effectiveTo:string|null;active:boolean;doctorId:string|null;categoryId:string|null;consultationType:string|null;serviceName:string|null;category:{name:string}|null;office:{name:string}|null;createdBy:{firstName:string;lastName:string}|null;audits:Audit[]};
type Check = {id:string;name:string;description:string;count:number;severity:'info'|'warning'|'critical';sampleIds:string[]};
type Run = {id:string;startedAt:string;finishedAt:string|null;status:string;results:Check[]|null};
type Stats = {period?:string;totalVisits:number;utilization:number;noShowRate:number;newPatients:number;returningPatients:number;timeSeries:{period:string;visits:number}[];bySpecialty:{name:string;visits:number}[];byOffice:{name:string;visits:number}[];doctorWorkload:{doctorId:string;doctorName:string;specialty:string;bookedCount:number;completedCount:number;bookedMinutes:number;availableMinutes:number;utilization:number;averageAppointmentsPerWorkingDay:number;cancelled?:number;expired?:number}[]};
const money=(n:number)=>new Intl.NumberFormat('en-US').format(n)+' KZT';
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'Asia/Almaty'}).format(new Date(value));
const localDateTime=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty'}).format(new Date());
const priorDay=(value:string,days:number)=>{const date=new Date(value+'T12:00:00+05:00');date.setUTCDate(date.getUTCDate()-days);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty'}).format(date);};
const isoStart=(date:string)=>new Date(date+'T00:00:00+05:00').toISOString();
const isoEnd=(date:string)=>new Date(date+'T00:00:00+05:00').toISOString();
const kindNames:Record<Kind,string>={visit:'Visit',treatment:'Treatment',parking:'Parking'};
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
  const [rounding,setRounding]=useState<'per_started_hour'|'per_minute'>('per_started_hour');
  const [effectiveFrom,setEffectiveFrom]=useState(localDateTime(new Date()));
  const [editing,setEditing]=useState<Rule|null>(null);
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
      if(view==='integrity') setRuns((await api<{runs:Run[]}>('/admin/integrity/runs')).runs);
      if(view==='reference') {
        const [c,l,d,a]=await Promise.all([api<{categories:Category[]}>('/admin/reference/categories'),api<{locations:Location[]}>('/admin/reference/locations'),api<{doctors:DoctorChoice[]}>('/admin/doctors'),api<{audits:ReferenceAudit[]}>('/admin/reference/audit')]);
        setCategories(c.categories);setLocations(l.locations);setReferenceDoctors(d.doctors);setReferenceAudits(a.audits);
      }
    } catch {setError('Could not load this information. Retry.');}
    finally {setBusy(false);}
  },[view,from,to,period]);
  useEffect(()=>{void load()},[load]);

  function startEdit(rule:Rule) {
    setEditing(rule);setKind(rule.kind);setDoctorId(rule.doctorId??'');setCategoryId(rule.categoryId??'');setConsultationType(rule.consultationType??'');setServiceName(rule.serviceName??'');setOfficeId(rule.office?.name?locations.find(item=>item.name===rule.office?.name)?.id??'':'');setAmount(String(rule.amountKzt));setRate(String(rule.ratePerHourKzt??''));setFreeMinutes(String(rule.freeMinutes));setRounding(rule.rounding as 'per_started_hour'|'per_minute');setEffectiveFrom(localDateTime(new Date()));
  }
  async function saveRule(event:FormEvent) {
    event.preventDefault();setError('');
    if(!Number.isInteger(Number(amount))||Number(amount)<0||kind==='parking'&&(!Number.isInteger(Number(rate))||Number(rate)<0)){setError('Enter whole-number KZT values that are zero or greater.');return;}
    if(editing&&(editing.doctorId||editing.categoryId)&&!window.confirm('This change affects existing doctors. Save it as a new price version?'))return;
    const body={kind,amountKzt:Number(amount),ratePerHourKzt:kind==='parking'?Number(rate):null,freeMinutes:Number(freeMinutes),rounding,effectiveFrom:new Date(effectiveFrom).toISOString(),effectiveTo:null,doctorId:kind==='visit'?(doctorId||null):null,categoryId:kind==='visit'?(categoryId||null):null,consultationType:kind==='visit'?(consultationType||null):null,serviceCode:kind==='treatment'?(serviceCode||null):null,serviceName:kind==='treatment'?(serviceName||null):null,officeId:kind==='parking'?(officeId||null):null};
    try{await api(editing?'/admin/pricing/'+encodeURIComponent(editing.id):'/admin/pricing',{method:editing?'PATCH':'POST',body:JSON.stringify(body)});setEditing(null);setDoctorId('');setCategoryId('');setConsultationType('');setServiceCode('');setServiceName('');setOfficeId('');setAmount('');setRate('');await load();}
    catch{setError('The pricing rule could not be saved. Check its dates and overlapping active rules.');}
  }
  async function deactivate(rule:Rule) {
    if(!window.confirm('Deactivate this pricing rule? Its previous booking period will remain in history.'))return;
    try{await api('/admin/pricing/'+encodeURIComponent(rule.id),{method:'PATCH',body:JSON.stringify({active:false})});await load();}
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
  const latestChecks=runs[0]?.results??[];
  const passedChecks=latestChecks.filter(check=>check.count===0).length;
  const warningChecks=latestChecks.filter(check=>check.count>0&&check.severity==='warning').length;
  const criticalChecks=latestChecks.filter(check=>check.count>0&&check.severity==='critical').length;
  return <main className="admin-page ad-page">
    <h1>{title}</h1>
    {error&&<div className="alert error" role="alert">{error}<button className="button button-outline" onClick={()=>void load()}>Retry</button></div>}
    {busy&&<p className="skeleton" role="status">Loading…</p>}
    {view==='pricing'&&<>
      <form className="panel pr-form" onSubmit={saveRule}>
        <h2>{editing?'Create a new version':'Add a pricing rule'}</h2>
        <label>Type<select value={kind} onChange={e=>setKind(e.target.value as Kind)}><option value="visit">Visit</option><option value="treatment">Treatment</option><option value="parking">Parking</option></select></label>
        <label>Amount (KZT)<input type="number" min="0" step="1" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        {kind==='parking'&&<><label>Hourly rate (KZT)<input type="number" min="0" step="1" value={rate} onChange={e=>setRate(e.target.value)} required/></label><label>Free minutes<input type="number" min="0" step="1" value={freeMinutes} onChange={e=>setFreeMinutes(e.target.value)}/></label><label>Rounding<select value={rounding} onChange={e=>setRounding(e.target.value as typeof rounding)}><option value="per_started_hour">Each started hour</option><option value="per_minute">Per minute</option></select></label></>}
        {kind==='visit'&&<><label>Doctor scope<select value={doctorId} onChange={e=>setDoctorId(e.target.value)}><option value="">Any doctor</option>{doctors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Specialty scope<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Any specialty</option>{categories.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Consultation type<input value={consultationType} onChange={e=>setConsultationType(e.target.value)} maxLength={80}/></label></>}
        {kind==='treatment'&&<><label>Service code<input value={serviceCode} onChange={e=>setServiceCode(e.target.value)} maxLength={80}/></label><label>Service name<input value={serviceName} onChange={e=>setServiceName(e.target.value)} maxLength={120}/></label></>}
        {kind==='parking'&&<label>Office scope<select value={officeId} onChange={e=>setOfficeId(e.target.value)}><option value="">All offices</option>{locations.filter(item=>isSelectableOffice(item,locations)).map(item=><option key={item.id} value={item.id}>{locationPath(item,locations)}</option>)}</select></label>}
        <label>Effective from<input type="datetime-local" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)} required/></label>
        <button className="button">{editing?'Save new version':'Add rule'}</button>{editing&&<button className="button button-outline" type="button" onClick={()=>setEditing(null)}>Cancel</button>}
      </form>
      <div className="ad-filters"><label>Type<select value={kindFilter} onChange={e=>setKindFilter(e.target.value as typeof kindFilter)}><option value="all">All types</option><option value="visit">Visits</option><option value="treatment">Treatments</option><option value="parking">Parking</option></select></label><label>Status<select value={activeFilter} onChange={e=>setActiveFilter(e.target.value as typeof activeFilter)}><option value="all">All rules</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
      <div className="table-wrap"><table className="admin-table"><thead><tr><th>Type/scope</th><th>Amount</th><th>Parking</th><th>Effective</th><th>Status</th><th>Version/audit</th><th>Actions</th></tr></thead><tbody>{visibleRules.map(rule=><tr key={rule.id}><td>{kindNames[rule.kind]} · {rule.category?.name??doctors.find(item=>item.id===rule.doctorId)?.name??rule.office?.name??rule.serviceName??'Global'}</td><td>{money(rule.amountKzt)}</td><td>{rule.ratePerHourKzt===null?'—':money(rule.ratePerHourKzt)+' / hour'}</td><td>{dateLabel(rule.effectiveFrom)}{rule.effectiveTo?' – '+dateLabel(rule.effectiveTo):''}</td><td>{ruleIsActive(rule)?'Active':rule.active?'Ended':'Inactive'}</td><td>{rule.createdBy?rule.createdBy.firstName+' '+rule.createdBy.lastName:'Admin'} · {rule.audits?.length??0} audit records</td><td><button className="button button-outline" onClick={()=>startEdit(rule)}>New version</button>{ruleIsActive(rule)&&<button className="button button-outline" onClick={()=>void deactivate(rule)}>Deactivate</button>}</td></tr>)}</tbody></table></div>
      {visibleRules.length===0&&<p className="search-state">No pricing rules match these filters.</p>}
      {visibleRules.some(rule=>rule.audits?.length>0)&&<section className="panel ad-audit"><h2>Price change audit</h2><ul>{visibleRules.flatMap(rule=>(rule.audits??[]).map(audit=><li key={audit.id}>{dateLabel(audit.createdAt)} · {audit.actor?.firstName??'Admin'} {audit.actor?.lastName??''} · {audit.action} · rule {rule.id} · {auditChange(audit.oldValue,audit.newValue)}</li>))}</ul></section>}
    </>}
    {view==='statistics'&&<>
      <div className="ad-filters"><button className="button button-outline" onClick={()=>{setFrom(priorDay(today(),6));setTo(today());}}>Last 7 days</button><button className="button button-outline" onClick={()=>{setFrom(priorDay(today(),29));setTo(today());}}>Last 30 days</button><button className="button button-outline" onClick={()=>{setFrom(priorDay(today(),89));setTo(today());}}>Last 90 days</button><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Group by<select value={period} onChange={e=>setPeriod(e.target.value as typeof period)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label><button className="button" onClick={()=>void load()}>Apply range</button></div>
      {!stats&&!busy&&<p className="search-state">No statistics available for this range.</p>}
      {stats&&<><div className="metric-row ad-metrics"><article className="metric-card"><span>Total visits</span><strong>{stats.totalVisits}</strong></article><article className="metric-card"><span>Utilization</span><strong>{Math.round(stats.utilization*100)}%</strong></article><article className="metric-card"><span>No-show rate</span><strong>{Math.round(stats.noShowRate*100)}%</strong></article><article className="metric-card"><span>New / returning patients</span><strong>{stats.newPatients} / {stats.returningPatients}</strong></article></div>
        {stats.totalVisits===0&&<p className="search-state">No visits in the selected period.</p>}
        <figure className="panel ad-chart"><figcaption>Booked visits grouped in Asia/Almaty. The table below gives the exact values.</figcaption><svg viewBox="0 0 700 220" role="img" aria-label="Bar chart of visits by date"><line x1="30" y1="190" x2="680" y2="190" stroke="var(--border)"/>{stats.timeSeries.map((point,index)=>{const width=600/Math.max(1,stats.timeSeries.length);const height=150*point.visits/maxVisits;return <g key={point.period}><rect x={40+index*width} y={185-height} width={Math.max(2,width-8)} height={height} fill="var(--primary)"/><text x={40+index*width} y="207" fontSize="10" fill="var(--text-secondary)">{point.period.slice(5)}</text></g>})}</svg></figure>
        <h2>Visits by {period}</h2><DataTable headings={['Date','Visits']} rows={stats.timeSeries.map(row=>[row.period,String(row.visits)])}/>
        <h2>Doctor workload</h2><label>Sort doctors<select value={workloadSort} onChange={event=>setWorkloadSort(event.target.value as typeof workloadSort)}><option value="bookedMinutes">Booked minutes</option><option value="utilization">Utilization</option><option value="doctorName">Name</option></select></label><DataTable headings={['Doctor','Specialty','Booked','Completed / in progress','Booked minutes','Available minutes','Utilization','Appointments / working day','Cancelled','No-show / expired']} rows={sortedWorkload.map(row=>[row.doctorName,row.specialty,String(row.bookedCount),String(row.completedCount),String(row.bookedMinutes),String(row.availableMinutes),Math.round(row.utilization*100)+'%',row.averageAppointmentsPerWorkingDay.toFixed(1),String(row.cancelled??0),String(row.expired??0)])}/>
        <div className="ad-breakdowns"><section><h2>By specialty</h2><MiniBars label="Visits by specialty" values={stats.bySpecialty}/><DataTable headings={['Specialty','Visits']} rows={stats.bySpecialty.map(row=>[row.name,String(row.visits)])}/></section><section><h2>By office/location</h2><MiniBars label="Visits by office or location" values={stats.byOffice}/><DataTable headings={['Location','Visits']} rows={stats.byOffice.map(row=>[row.name,String(row.visits)])}/></section></div>
      </>}
    </>}
    {view==='integrity'&&<><div className="metric-row ad-metrics"><article className="metric-card"><span>Checks passed</span><strong>{passedChecks}</strong></article><article className="metric-card"><span>Warnings</span><strong>{warningChecks}</strong></article><article className="metric-card"><span>Critical</span><strong>{criticalChecks}</strong></article></div><button className="button" onClick={()=>void runIntegrity()} disabled={busy}>{busy?'Running checks…':'Run checks now'}</button>{runs.length===0&&!busy&&<p className="search-state">No integrity runs recorded yet.</p>}{runs.map((run,runIndex)=><section className="panel ad-run" key={run.id}><h2>Run · {dateLabel(run.startedAt)} · {run.status}</h2>{runIndex===0&&<p>Latest run compared with the previous run. Sample contains record IDs only.</p>}<div className="table-wrap"><table className="admin-table"><thead><tr><th>Check</th><th>Count</th><th>Trend</th><th>Severity</th><th>Details</th></tr></thead><tbody>{(run.results??[]).map(check=>{const prior=(runIndex===0?runs[1]?.results:undefined)?.find(item=>item.id===check.id);const delta=prior?check.count-prior.count:null;return <tr key={check.id}><td><strong>{check.name??checkName(check.id)}</strong><br/><small>{check.description??''}</small></td><td>{check.count}</td><td>{delta===null?'—':delta===0?'No change':delta>0?'+'+delta:String(delta)}</td><td><span className="status-pill">{check.severity}</span></td><td>{check.sampleIds?.length?<details><summary>Show {check.sampleIds.length} sample IDs</summary><ul>{check.sampleIds.map(id=><li key={id}><code>{id}</code></li>)}</ul></details>:'—'}</td></tr>})}</tbody></table></div></section>)}</>}
    {view==='reference'&&<>
      <div className="ad-tabs"><button className="button" onClick={()=>setTab('categories')}>Doctor categories</button><button className="button button-outline" onClick={()=>setTab('locations')}>Office locations</button></div>
      {tab==='categories'&&<><form className="panel pr-form" onSubmit={saveCategory}><label>{editingCategory?'Edit category':'New category'}<input value={categoryName} onChange={e=>setCategoryName(e.target.value)} minLength={2} maxLength={80} required/></label><button className="button">{editingCategory?'Save category':'Add category'}</button>{editingCategory&&<button className="button button-outline" type="button" onClick={()=>{setEditingCategory(null);setCategoryName('')}}>Cancel</button>}</form><DataTable headings={['Category','Doctors','Status','Action']} rows={categories.map(item=>[item.name,String(item._count.doctors),item.active?'Active':'Inactive',''])} renderRows={categories.map(item=><tr key={item.id}><td>{item.name}</td><td>{item._count.doctors}</td><td>{item.active?'Active':'Inactive'}</td><td><button className="button button-outline" onClick={()=>editCategory(item)}>Edit</button> <button className="button button-outline" onClick={()=>void toggleCategory(item)}>{item.active?'Deactivate':'Reactivate'}</button></td></tr>)}/></>}
      {tab==='locations'&&<><form className="panel pr-form" onSubmit={saveLocation}><label>Level<select disabled={Boolean(editingLocation)} value={locationKind} onChange={e=>{setLocationKind(e.target.value as typeof locationKind);setParentId('')}}><option value="city">City</option><option value="floor">Floor</option><option value="office">Office</option></select></label><label>Name<input value={locationName} onChange={e=>setLocationName(e.target.value)} maxLength={120} required/></label>{locationKind!=='city'&&<label>Parent<select value={parentId} onChange={e=>setParentId(e.target.value)} required><option value="">Choose parent</option>{parents.filter(item=>item.id!==editingLocation?.id).map(item=><option key={item.id} value={item.id}>{item.kind}: {item.name}</option>)}</select></label>}<button className="button">{editingLocation?'Save location':'Add location'}</button>{editingLocation&&<button className="button button-outline" type="button" onClick={resetLocationForm}>Cancel</button>}</form><LocationTree locations={locations} onEdit={editLocation} onToggle={item=>void toggleLocation(item)}/><h2>Doctor office assignments</h2><div className="table-wrap"><table className="admin-table"><thead><tr><th>Doctor</th><th>Office</th></tr></thead><tbody>{referenceDoctors.map(doctor=><tr key={doctor.id}><td>{doctor.name}</td><td><select aria-label={'Office for '+doctor.name} value={doctor.locationId??''} onChange={event=>void assignDoctor(doctor,event.target.value)}><option value="">Unassigned</option>{locations.filter(item=>isSelectableOffice(item,locations)).map(item=><option key={item.id} value={item.id}>{locationPath(item,locations)}</option>)}</select></td></tr>)}</tbody></table></div></>}<section className="panel ad-audit"><h2>Recent reference changes</h2><DataTable headings={['Date','Type','Record','Action','Changed by','Old → new']} rows={referenceAudits.map(audit=>[dateLabel(audit.createdAt),audit.entity,audit.entityId,audit.action,audit.actor?audit.actor.firstName+' '+audit.actor.lastName:'Admin',JSON.stringify(audit.oldValue??null)+' → '+JSON.stringify(audit.newValue??null)])}/></section>
    </>}
    <button className="button button-outline" onClick={()=>void load()}>Refresh</button>
  </main>;
}

function auditChange(oldValue:unknown,newValue:unknown) { const read=(value:unknown)=>{if(!value||typeof value!=='object')return '—';const record=value as {amountKzt?:unknown;ratePerHourKzt?:unknown;freeMinutes?:unknown;rounding?:unknown};return 'amount '+String(record.amountKzt??'—')+', hourly '+String(record.ratePerHourKzt??'—')+', free '+String(record.freeMinutes??'—')+' min, '+String(record.rounding??'—');};return read(oldValue)+' → '+read(newValue);}

function MiniBars({label,values}:{label:string;values:{name:string;visits:number}[]}) {const max=Math.max(1,...values.map(item=>item.visits));return <figure className="panel ad-mini-chart"><figcaption>{label}. Exact values are listed in the table below.</figcaption><ul>{values.map(item=><li key={item.name}><span>{item.name}</span><span className="ad-bar-track"><span className="ad-bar" style={{width:(item.visits/max*100)+'%'}}/></span><strong>{item.visits}</strong></li>)}</ul></figure>;}

function DataTable({headings,rows,renderRows}:{headings:string[];rows:string[][];renderRows?:ReactNode}) {
  return <div className="table-wrap"><table className="admin-table"><thead><tr>{headings.map(item=><th key={item}>{item}</th>)}</tr></thead><tbody>{renderRows??rows.map((row,index)=><tr key={index}>{row.map((value,cell)=><td key={cell}>{value}</td>)}</tr>)}</tbody></table>{rows.length===0&&<p className="search-state">No records available.</p>}</div>;
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
  const node=(item:Location):ReactNode=><li key={item.id}><details open={item.kind==='city'}><summary>{item.kind}: {item.name} · {countUsage(item).doctors} doctors · {countUsage(item).slots} slots · {item.active?'Active':'Inactive'}</summary><div className="ad-location-actions"><button className="button button-outline" onClick={()=>onEdit(item)}>Edit</button><button className="button button-outline" onClick={()=>onToggle(item)}>{item.active?'Deactivate':'Reactivate'}</button></div>{children(item.id).length>0&&<ul>{children(item.id).map(node)}</ul>}</details></li>;
  return <section className="panel ad-location-tree" aria-label="Office locations"><h2>City → floor → office</h2><ul>{children(null).filter(item=>item.kind==='city').map(node)}</ul>{children(null).filter(item=>item.kind!=='city').map(node)}</section>;
}
