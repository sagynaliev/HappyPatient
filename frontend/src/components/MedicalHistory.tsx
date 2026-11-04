import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';
import '../styles/medicalHistory.css';
import { toast } from '../lib/toast';

export const categoryLabels = { test: 'Tests', anamnesis: 'Anamnesis', conclusion: 'Conclusions' };
export type MedicalCategory = keyof typeof categoryLabels;
export type MedicalEntry = { id: string; category: MedicalCategory; title: string; body: string; createdAt: string; updatedAt: string; eventAt?: string; appointmentStartAt?: string|null; doctor: { user: { firstName: string; lastName: string } } };
type HistoryResponse = { entries: MedicalEntry[]; hasMore: boolean; counts: Partial<Record<MedicalCategory, number>> };
const almaty = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', ...options });
const timeText = almaty({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayText = almaty({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthText = almaty({ month: 'short' });
const dayNumber = almaty({ day: 'numeric' });
const categoryIcons = { test: 'chart', anamnesis: 'file', conclusion: 'check' } as const;
const LONG_NOTE = 320;

function MedicalEntryCard({ entry, eventAt }: { entry: MedicalEntry; eventAt: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = entry.body.length > LONG_NOTE;
  return <article className={`mh-entry is-${entry.category}`}>
    <header className="mh-entry-head">
      <span className={`mh-pill is-${entry.category}`}><Icon name={categoryIcons[entry.category]} size={14} /> {categoryLabels[entry.category]}</span>
      <time className="mh-entry-time" dateTime={eventAt}><Icon name="clock" size={14} /> {timeText.format(new Date(eventAt))}</time>
    </header>
    <h3>{entry.title}</h3>
    <p className={`mh-body${long && !expanded ? ' is-clamped' : ''}`}>{entry.body}</p>
    {long && <button className="mh-more" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Show more'}</button>}
    <footer className="mh-entry-doctor"><Icon name="stethoscope" size={15} /> Dr. {entry.doctor.user.firstName} {entry.doctor.user.lastName}{entry.updatedAt !== entry.createdAt && <span> · edited</span>}</footer>
  </article>;
}

export function MedicalEntryList({ entries }: { entries: MedicalEntry[] }) {
  const groups: Array<{ day: string; at: string; items: Array<{ entry: MedicalEntry; eventAt: string }> }> = [];
  for (const entry of entries) {
    const eventAt = entry.eventAt ?? entry.appointmentStartAt ?? entry.createdAt;
    const day = dayText.format(new Date(eventAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push({ entry, eventAt });
    else groups.push({ day, at: eventAt, items: [{ entry, eventAt }] });
  }
  return <ol className="mh-list">{groups.map(group => <li className="mh-group" key={`${group.day}-${group.items[0].entry.id}`}>
    <div className="mh-date" aria-hidden="true"><span>{monthText.format(new Date(group.at))}</span><strong>{dayNumber.format(new Date(group.at))}</strong></div>
    <div className="mh-group-body">
      <h3 className="mh-date-heading">{group.day}</h3>
      {group.items.map(({ entry, eventAt }) => <MedicalEntryCard key={entry.id} entry={entry} eventAt={eventAt} />)}
    </div>
  </li>)}</ol>;
}

export function MedicalNoteForm({ appointmentId, onSave, onCancel }: { appointmentId: string; onSave: (entry: MedicalEntry) => void; onCancel: () => void }) {
  const [category, setCategory] = useState<MedicalCategory>('anamnesis');
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!title.trim() || title.trim().length > 120 || !body.trim() || body.trim().length > 5000) { setError('Enter a title (1–120) and note (1–5000 characters).'); return; }
    setBusy(true);
    try { const result = await api<{ entry: MedicalEntry }>('/medical-history', { method: 'POST', body: JSON.stringify({ appointmentId, category, title: title.trim(), body: body.trim() }) }); onSave(result.entry); }
    catch { setError('Unable to save the note. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className="mh-form" onSubmit={submit} noValidate>
    <h3>Add medical note</h3>
    {error && <p id="mh-form-error" className="alert error" role="alert">{error}</p>}
    <label htmlFor="mh-category">Category</label><select id="mh-category" value={category} onChange={event => setCategory(event.target.value as MedicalCategory)} disabled={busy} required>{Object.entries(categoryLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
    <label htmlFor="mh-title">Title</label><input id="mh-title" value={title} maxLength={120} required disabled={busy} aria-describedby={error ? 'mh-form-error' : undefined} onChange={event => setTitle(event.target.value)} />
    <label htmlFor="mh-body">Note</label><textarea id="mh-body" value={body} maxLength={5000} rows={7} required disabled={busy} aria-describedby={`mh-counter${error ? ' mh-form-error' : ''}`} onChange={event => setBody(event.target.value)} />
    <small id="mh-counter">{body.length}/5000 characters</small>
    <div className="mh-actions"><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button><button className="button button-outline" type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

export default function MedicalHistory({ patientId, appointmentId }: { patientId?: string; appointmentId?: string }) {
  const [direction,setDirection]=useState<'asc'|'desc'>('desc');
  const [entries, setEntries] = useState<MedicalEntry[]>([]);
  const [counts, setCounts] = useState<HistoryResponse['counts']>({});
  const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(false);
  const [filter, setFilter] = useState<MedicalCategory | 'all'>('all'); const [adding, setAdding] = useState(false);
  const [retry, setRetry] = useState(0);
  const path = `/medical-history?${patientId ? `patientId=${encodeURIComponent(patientId)}&` : ''}direction=${direction}&${filter !== 'all' ? `category=${filter}&` : ''}`;
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    api<HistoryResponse>(path).then(result => { if (active) { setEntries(result.entries); setCounts(result.counts); setHasMore(result.hasMore); } }).catch(() => { if (active) setError('Unable to load medical history.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, retry]);
  async function loadMore() {
    setLoading(true); setError('');
    try { const result = await api<HistoryResponse>(`${path}offset=${entries.length}`); setEntries(current => [...current, ...result.entries]); setCounts(result.counts); setHasMore(result.hasMore); }
    catch { setError('Unable to load medical history.'); }
    finally { setLoading(false); }
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const filters = [
    { key: 'all' as const, label: 'All records', icon: 'heart' as const, count: total },
    ...(Object.keys(categoryLabels) as MedicalCategory[]).map(key => ({ key, label: categoryLabels[key], icon: categoryIcons[key], count: counts[key] ?? 0 })),
  ];
  return <section className="mh-history" aria-label="Medical history" aria-busy={loading}>
    <div className="mh-filters" role="group" aria-label="Filter medical entries">
      {filters.map(item => <button type="button" className={`mh-filter is-${item.key}`} aria-pressed={filter === item.key} aria-label={`${item.label} (${item.count})`} key={item.key} onClick={() => setFilter(item.key)}>
        <span className="mh-filter-icon"><Icon name={item.icon} size={20} /></span>
        <span className="mh-filter-text"><strong>{item.count}</strong><span>{item.label}</span></span>
      </button>)}
    </div>
    <div className="mh-card">
      <header className="mh-heading">
        <h2>Timeline</h2>
        <div className="mh-heading-actions">
          <div className="mh-sort" role="group" aria-label="Sort records">
            <button type="button" aria-pressed={direction === 'desc'} onClick={() => setDirection('desc')}>Newest first</button>
            <button type="button" aria-pressed={direction === 'asc'} onClick={() => setDirection('asc')}>Oldest first</button>
          </div>
          {appointmentId && !adding && <button className="button small" type="button" onClick={() => { setAdding(true); setSuccess(false); }}>Add note</button>}
        </div>
      </header>
      {adding && appointmentId && <MedicalNoteForm appointmentId={appointmentId} onCancel={() => setAdding(false)} onSave={() => { setFilter('all'); setAdding(false); setSuccess(true); setRetry(value => value + 1); toast.success('Medical note saved', 'It is now in the patient’s timeline.'); }} />}
      {success && <p className="mh-alert is-success" role="status"><Icon name="check" size={16} /> Medical note saved.</p>}
      {error && <div className="mh-alert is-error" role="alert"><span>{error}</span> <button className="button button-outline small" type="button" onClick={() => { if (entries.length) void loadMore(); else setRetry(value => value + 1); }}>Retry</button></div>}
      {loading && entries.length === 0 && <div role="status" className="mh-loading"><span className="sr-only">Loading medical history…</span><div className="skeleton mh-skeleton" /><div className="skeleton mh-skeleton" /></div>}
      {!loading && !error && entries.length === 0 && <div className="mh-empty">
        <span className="mh-empty-icon"><Icon name="file" size={26} /></span>
        <h3>{filter === 'all' ? 'No records yet' : `No ${categoryLabels[filter].toLowerCase()} yet`}</h3>
        <p>{filter === 'all' ? 'No medical records yet. Entries added by your doctor after a visit will appear here.' : 'No entries in this category.'}</p>
      </div>}
      <MedicalEntryList entries={entries} />
      {hasMore && <button className="button button-outline mh-load-more" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load more'}</button>}
      {loading && entries.length > 0 && <p role="status" className="sr-only">Loading medical history…</p>}
    </div>
  </section>;
}
