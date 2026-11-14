import { FormEvent, useEffect, useState } from "react";
import { authApi, TreatmentChoice, VisitTreatment } from "../lib/api";
import { toast } from "../lib/toast";
import { Icon } from "./Icons";

const money = (value: number) => `${new Intl.NumberFormat("en-US").format(value)} KZT`;

/** Treatments done during a checked-in visit. The patient sees them, with prices, in the visit's price breakdown. */
export default function VisitTreatments({ slotId }: { slotId: string }) {
  const [added, setAdded] = useState<VisitTreatment[]>([]);
  const [available, setAvailable] = useState<TreatmentChoice[]>([]);
  const [editable, setEditable] = useState(false);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    authApi.visitTreatments(slotId)
      .then((result) => { if (active) { setAdded(result.added); setAvailable(result.available); setEditable(result.editable); } })
      .catch(() => { if (active) setError("Treatments could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slotId]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!choice) return;
    setBusy(true); setError("");
    try {
      const { treatment } = await authApi.addVisitTreatment(slotId, choice);
      setAdded((current) => [...current, treatment]);
      setChoice("");
      toast.success("Treatment added", `${treatment.name} · ${money(treatment.amountKzt)}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The treatment was not added."); }
    finally { setBusy(false); }
  }

  async function remove(item: VisitTreatment) {
    setBusy(true); setError("");
    try { await authApi.removeVisitTreatment(slotId, item.id); setAdded((current) => current.filter((row) => row.id !== item.id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The treatment was not removed."); }
    finally { setBusy(false); }
  }

  if (loading) return null;
  if (!editable && added.length === 0) return null;
  const total = added.reduce((sum, item) => sum + item.amountKzt, 0);
  return <section className="dw-card dw-treatments" aria-labelledby="dw-treatments-title">
    <header className="dw-treatments-head">
      <div><h2 id="dw-treatments-title">Treatments</h2><p>{editable ? "Record what was done during this visit. The patient sees each treatment and its price." : "Recorded during this visit."}</p></div>
      {added.length > 0 && <strong className="dw-treatments-total">{money(total)}</strong>}
    </header>
    {error && <p className="dw-alert" role="alert">{error}</p>}
    {added.length > 0 && <ul className="dw-treatments-list">{added.map((item) => <li key={item.id}>
      <span><Icon name="check" size={15} /> {item.name}{item.code ? <small>{item.code}</small> : null}</span>
      <span className="dw-treatments-price">{money(item.amountKzt)}</span>
      {editable && <button type="button" className="dw-mini is-danger" disabled={busy} aria-label={`Remove ${item.name}`} onClick={() => void remove(item)}>Remove</button>}
    </li>)}</ul>}
    {editable && (available.length
      ? <form className="dw-treatments-add" onSubmit={add}>
        <label className="sr-only" htmlFor="dw-treatment">Treatment</label>
        <select id="dw-treatment" value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
          <option value="">Choose a treatment…</option>
          {available.map((item) => <option key={item.key} value={item.key}>{item.name} · {money(item.amountKzt)}</option>)}
        </select>
        <button type="submit" className="dw-button" disabled={busy || !choice}>{busy ? "Saving…" : "Add treatment"}</button>
      </form>
      : <p className="dw-muted">The clinic has not priced any treatments yet. An administrator adds them under Pricing.</p>)}
  </section>;
}
