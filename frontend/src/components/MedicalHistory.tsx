import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

export const categoryLabels = { test: 'Tests', anamnesis: 'Anamnesis', conclusion: 'Conclusions' };
export type MedicalCategory = keyof typeof categoryLabels;
export type MedicalEntry = { id: string; category: MedicalCategory; title: string; body: string; createdAt: string; updatedAt: string; eventAt?: string; appointmentStartAt?: string|null; doctor: { user: { firstName: string; lastName: string } } };
type HistoryResponse = { entries: MedicalEntry[]; hasMore: boolean; counts: Partial<Record<MedicalCategory, number>> };
const dateText = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(new Date(value));

export function MedicalEntryList({ entries }: { entries: MedicalEntry[] }) {
  let previousDate = '';
  return <div className="mh-list">{entries.map(entry => { const eventAt = entry.eventAt ?? entry.appointmentStartAt ?? entry.createdAt; const date = new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Almaty'}).format(new Date(eventAt)); const heading = date !== previousDate; previousDate = date; return <div key={entry.id}>{heading && <h3 className="mh-date-heading">{date}</h3>}<article className="panel mh-entry">
    <span className={`tag mh-tag-${entry.category}`}>{categoryLabels[entry.category]}</span>
    <h3>{entry.title}</h3><p className="mh-meta"><time dateTime={eventAt}>{dateText(eventAt)}</time> · Dr. {entry.doctor.user.firstName} {entry.doctor.user.lastName}{entry.updatedAt !== entry.createdAt && ' · edited'}</p>
    <p className="mh-body">{entry.body}</p>
  </article></div>;})}</div>;
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
  return <form className="mh-form panel" onSubmit={submit} noValidate>
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
  const [direction,setDirection]=useState<'asc'|'desc'>('asc');
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
  const filtered = entries;
  return <section className="mh-history" aria-label="Medical history" aria-busy={loading}>
    <div className="mh-heading"><h2>Medical History timeline</h2><button className="button button-outline" onClick={()=>setDirection(value=>value==='asc'?'desc':'asc')}>{direction==='asc'?'Oldest first':'Newest first'}</button>{appointmentId && !adding && <button className="button" onClick={() => { setAdding(true); setSuccess(false); }}>Add note</button>}</div>
    {adding && appointmentId && <MedicalNoteForm appointmentId={appointmentId} onCancel={() => setAdding(false)} onSave={() => { setFilter('all'); setAdding(false); setSuccess(true); setRetry(value => value + 1); }} />}
    {success && <p className="alert success" role="status">Medical note saved.</p>}
    <div className="mh-filters" role="group" aria-label="Filter medical entries">{(['all', 'test', 'anamnesis', 'conclusion'] as const).map(key => <button className={`filter-chip${filter === key ? ' active' : ''}`} aria-pressed={filter === key} key={key} onClick={() => setFilter(key)}>{key === 'all' ? 'All' : categoryLabels[key]} ({key === 'all' ? total : counts[key] ?? 0})</button>)}</div>
    {error && <div className="alert error" role="alert">{error} <button className="button button-outline" onClick={() => { if (entries.length) void loadMore(); else setRetry(value => value + 1); }}>Retry</button></div>}
    {loading && <div role="status" className="mh-loading"><span>Loading medical history…</span><div className="skeleton mh-skeleton" /></div>}
    {!loading && !error && entries.length === 0 && filter !== 'all' && <p className="search-state">No entries in this category.</p>}
    {!loading && !error && entries.length === 0 && filter === 'all' && <p className="search-state">No medical records yet. Entries added by your doctor after a visit will appear here.</p>}
    {!loading && !error && entries.length > 0 && filtered.length === 0 && <p className="search-state">No entries in this category among the loaded records.</p>}
    <MedicalEntryList entries={filtered} />
    {hasMore && <button className="button button-outline" disabled={loading} onClick={() => void loadMore()}>Load more</button>}
  </section>;
}
