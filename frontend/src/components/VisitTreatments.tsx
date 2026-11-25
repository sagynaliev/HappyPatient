import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi, TreatmentChoice, VisitTreatment } from "../lib/api";
import { toast } from "../lib/toast";
import { Icon } from "./Icons";

export const money = (value: number) => `${new Intl.NumberFormat("en-US").format(value)} KZT`;
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** Treatments of one checked-in visit: what was added, what can be added, and whether the doctor may still change them. */
export function useVisitTreatments(slotId: string, enabled: boolean, refreshKey = 0) {
  const [added, setAdded] = useState<VisitTreatment[]>([]);
  const [available, setAvailable] = useState<TreatmentChoice[]>([]);
  const [editable, setEditable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoaded(false);
    setError("");
    authApi.visitTreatments(slotId)
      .then((result) => { if (active) { setAdded(result.added); setAvailable(result.available); setEditable(result.editable); } })
      .catch(() => { if (active) { setError("Treatments could not be loaded. Close this dialog and try again."); toast.error("Treatments could not be loaded"); } })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [slotId, enabled, refreshKey]);

  /** Adds each chosen treatment as many times as asked; stops at the first refusal and keeps what was saved. */
  const add = useCallback(async (picks: Array<{ key: string; count: number }>) => {
    setBusy(true);
    const saved: VisitTreatment[] = [];
    try {
      for (const pick of picks) for (let index = 0; index < pick.count; index += 1) saved.push((await authApi.addVisitTreatment(slotId, pick.key)).treatment);
      toast.success(saved.length === 1 ? "Treatment added" : `${saved.length} treatments added`, money(saved.reduce((sum, item) => sum + item.amountKzt, 0)));
      return true;
    } catch (caught) {
      toast.error("Treatment not added", caught instanceof Error ? caught.message : "Try again.");
      return false;
    } finally {
      if (saved.length) setAdded((current) => [...current, ...saved]);
      setBusy(false);
    }
  }, [slotId]);

  const remove = useCallback(async (item: VisitTreatment) => {
    setBusy(true);
    try { await authApi.removeVisitTreatment(slotId, item.id); setAdded((current) => current.filter((row) => row.id !== item.id)); toast.neutral("Treatment removed", item.name); }
    catch (caught) { toast.error("Treatment not removed", caught instanceof Error ? caught.message : "Try again."); }
    finally { setBusy(false); }
  }, [slotId]);

  return { added, available, editable, loaded, error, busy, add, remove };
}

/** The visit's treatments as one timeline record: each line with its price, the total, and Remove while still editable. */
export function TreatmentTimelineBlock({ items, editable, busy, onRemove }: { items: VisitTreatment[]; editable: boolean; busy: boolean; onRemove: (item: VisitTreatment) => void }) {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + item.amountKzt, 0);
  return (
    <article className="mh-treatments" aria-label="Treatments in this visit">
      <header>
        <span className="mh-treatments-chip"><Icon name="spark" size={14} /> Treatments</span>
        <strong>{money(total)}</strong>
      </header>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span className="mh-treatments-name">{item.name}{item.code && <small>{item.code}</small>}</span>
            <span className="mh-treatments-time">{time(item.createdAt)}</span>
            <span className="mh-treatments-price">{money(item.amountKzt)}</span>
            {editable && <button type="button" className="mh-treatments-remove" disabled={busy} aria-label={`Remove ${item.name}`} onClick={() => onRemove(item)}><Icon name="close" size={15} /></button>}
          </li>
        ))}
      </ul>
      <p>The patient sees these in the visit's price breakdown.</p>
    </article>
  );
}

/** Pick treatments the way services are added at a salon desk: search, +/- per item, then one Add. */
export function AddTreatmentDialog({ available, specialty, busy, loading = false, error = "", onAdd, onClose }: { available: TreatmentChoice[]; specialty?: string; busy: boolean; loading?: boolean; error?: string; onAdd: (picks: Array<{ key: string; count: number }>) => Promise<boolean>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const text = query.trim().toLocaleLowerCase();
  const matches = available.filter((item) => !text || item.name.toLocaleLowerCase().includes(text) || (item.code ?? "").toLocaleLowerCase().includes(text));
  const groups = useMemo(() => [
    { title: specialty ? `For ${specialty}` : "For your specialty", items: matches.filter((item) => item.scope === "specialty" || item.scope === "doctor") },
    { title: "For every doctor", items: matches.filter((item) => !item.scope || item.scope === "general") },
  ].filter((group) => group.items.length), [matches, specialty]);
  const picked = available.filter((item) => counts[item.key]);
  const pickedCount = picked.reduce((sum, item) => sum + counts[item.key], 0);
  const pickedTotal = picked.reduce((sum, item) => sum + counts[item.key] * item.amountKzt, 0);
  const step = (key: string, delta: number) => setCounts((current) => { const next = Math.max(0, Math.min(9, (current[key] ?? 0) + delta)); const copy = { ...current }; if (next) copy[key] = next; else delete copy[key]; return copy; });

  async function submit() {
    if (!pickedCount) return;
    if (await onAdd(picked.map((item) => ({ key: item.key, count: counts[item.key] })))) onClose();
  }

  return (
    <div className="dw-modal-backdrop tr-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="tr-title">
        <header className="tr-head">
          <h2 id="tr-title">Add treatment</h2>
          <button type="button" className="tr-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </header>
        <label className="tr-search"><Icon name="search" size={16} /><span className="sr-only">Search treatments</span>
          <input ref={searchRef} type="search" value={query} placeholder="Search treatments…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="tr-list">
          {loading ? <p className="tr-empty" role="status">Loading treatments…</p>
            : error ? <p className="tr-empty" role="alert">{error}</p>
            : available.length === 0 ? <p className="tr-empty">No treatments have a price for this booking. An administrator can add them under Pricing. The specialty must match and the price must be effective on the date the appointment was booked.</p>
            : groups.length === 0 ? <p className="tr-empty">Nothing matches “{query.trim()}”.</p>
            : groups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.items.map((item) => {
                    const count = counts[item.key] ?? 0;
                    return (
                      <li key={item.key} className={count ? "is-picked" : undefined}>
                        <span className="tr-letter" aria-hidden="true">{item.name[0]?.toUpperCase() ?? "?"}</span>
                        <span className="tr-name"><strong>{item.name}</strong><small>{[item.code, money(item.amountKzt)].filter(Boolean).join(" · ")}</small></span>
                        {count === 0
                          ? <button type="button" className="tr-plus" aria-label={`Add ${item.name}`} onClick={() => step(item.key, 1)}>+</button>
                          : <span className="tr-stepper" role="group" aria-label={`${item.name} quantity`}>
                              <button type="button" aria-label={`One less ${item.name}`} onClick={() => step(item.key, -1)}>−</button>
                              <output aria-live="polite">{count}</output>
                              <button type="button" aria-label={`One more ${item.name}`} onClick={() => step(item.key, 1)}>+</button>
                            </span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
        <footer className="tr-foot">
          <span>{pickedCount ? `${pickedCount} selected · ${money(pickedTotal)}` : "Nothing selected"}</span>
          <button type="button" className="dw-button" disabled={!pickedCount || busy || loading || Boolean(error)} onClick={() => void submit()}>{busy ? "Adding…" : "Add"}</button>
        </footer>
      </div>
    </div>
  );
}
