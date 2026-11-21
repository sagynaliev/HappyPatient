import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { Icon } from "./Icons";

/** The clinic's place tree: city -> clinic -> floor -> office. */
export type LocationLevel = "city" | "clinic" | "floor" | "office";
export type RefLocation = { id: string; name: string; kind: LocationLevel; parentId: string | null; active: boolean; usage?: { doctors: number; slots: number } };
export type OfficeDoctor = { id: string; name: string; specialty?: string; locationId: string | null };

const LEVELS: LocationLevel[] = ["city", "clinic", "floor", "office"];
const LEVEL_TITLE: Record<LocationLevel, string> = { city: "Cities", clinic: "Clinics", floor: "Floors", office: "Offices" };
const LEVEL_NAME: Record<LocationLevel, string> = { city: "city", clinic: "clinic", floor: "floor", office: "office" };
const LEVEL_EXAMPLE: Record<LocationLevel, string> = { city: "e.g. Almaty", clinic: "e.g. Central Clinic", floor: "e.g. Floor 2", office: "e.g. Room 204" };
/** "a clinic", "an office". */
const withArticle = (noun: string) => `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const errorText = (caught: unknown, fallback: string) => (caught instanceof Error && caught.message ? caught.message : fallback);

/** "Almaty › Central Clinic › Floor 2 › Room 204". */
export function locationPath(item: Pick<RefLocation, "name" | "parentId">, locations: RefLocation[]) {
  const parts = [item.name];
  for (let parentId = item.parentId; parentId; ) {
    const parent = locations.find((location) => location.id === parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join(" › ");
}

/** An office patients can be sent to: it and every level above it are active. */
export function isSelectableOffice(item: RefLocation, locations: RefLocation[]) {
  if (item.kind !== "office") return false;
  for (let node: RefLocation | undefined = item; node; node = node.parentId ? locations.find((location) => location.id === node!.parentId) : undefined) {
    if (!node.active) return false;
    if (node.kind === "city") return true;
  }
  return false;
}

export function AdminDialog({ title, description, onClose, children }: { title: string; description?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    (ref.current?.querySelector<HTMLElement>("input, select") ?? ref.current?.querySelector<HTMLElement>(".ad-dialog-actions button"))?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ad-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ad-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-dialog-title" ref={ref}>
        <header className="ad-dialog-head">
          <div><h2 id="ad-dialog-title">{title}</h2>{description && <p className="ad-muted">{description}</p>}</div>
          <button type="button" className="ad-icon-button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

type Pending =
  | { mode: "add"; level: LocationLevel; parent: RefLocation | null }
  | { mode: "rename"; item: RefLocation }
  | { mode: "deactivate"; item: RefLocation };

/** Four columns, one per level: choose a place to see what is inside it; add, rename or close places in place. */
export function LocationColumns({ locations, onSaved }: { locations: RefLocation[]; onSaved: () => Promise<void> }) {
  const [selected, setSelected] = useState<Partial<Record<LocationLevel, string>>>({});
  const [search, setSearch] = useState<Partial<Record<LocationLevel, string>>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".ad-col-menu")) setMenu(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  const byId = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
  const parentOf = (level: LocationLevel) => (level === "city" ? null : byId.get(selected[LEVELS[LEVELS.indexOf(level) - 1]] ?? "") ?? null);

  function choose(level: LocationLevel, id: string) {
    const index = LEVELS.indexOf(level);
    setSelected((current) => {
      const next: Partial<Record<LocationLevel, string>> = {};
      LEVELS.slice(0, index).forEach((key) => { next[key] = current[key]; });
      next[level] = id;
      return next;
    });
  }

  function open(next: Pending) {
    setMenu(null);
    setDialogError("");
    setName(next.mode === "rename" ? next.item.name : "");
    setPending(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setDialogError("");
    try {
      if (pending.mode === "add") {
        const result = await api<{ location: RefLocation }>("/admin/reference/locations", { method: "POST", body: JSON.stringify({ name: name.trim(), kind: pending.level, parentId: pending.parent?.id ?? null }) });
        toast.success(`${name.trim()} added`);
        await onSaved();
        choose(pending.level, result.location.id);
      } else if (pending.mode === "rename") {
        await api("/admin/reference/locations/" + encodeURIComponent(pending.item.id), { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
        toast.success("Renamed to " + name.trim());
        await onSaved();
      } else {
        await api("/admin/reference/locations/" + encodeURIComponent(pending.item.id), { method: "PATCH", body: JSON.stringify({ active: false }) });
        toast.neutral(`${pending.item.name} deactivated`, "Patients are no longer sent there.");
        await onSaved();
      }
      setPending(null);
    } catch (caught) {
      setDialogError(errorText(caught, "The change could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(item: RefLocation) {
    setMenu(null);
    try {
      await api("/admin/reference/locations/" + encodeURIComponent(item.id), { method: "PATCH", body: JSON.stringify({ active: true }) });
      toast.success(`${item.name} reactivated`);
      await onSaved();
    } catch (caught) {
      toast.error("Not reactivated", errorText(caught, "Try again."));
    }
  }

  return (
    <section className="admin-panel ad-panel" aria-labelledby="ad-places-heading">
      <div className="admin-panel-header"><div><h2 id="ad-places-heading">Clinic places</h2><p className="ad-muted">City → clinic → floor → office. Choose a place to see what is inside it.</p></div></div>
      <div className="ad-columns">
        {LEVELS.map((level) => {
          const parent = parentOf(level);
          const needsParent = level !== "city" && !parent;
          const query = (search[level] ?? "").trim().toLocaleLowerCase();
          const items = needsParent ? [] : locations
            .filter((item) => item.kind === level && item.parentId === (parent?.id ?? null))
            .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
            .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, undefined, { numeric: true }));
          const total = needsParent ? 0 : locations.filter((item) => item.kind === level && item.parentId === (parent?.id ?? null)).length;
          const parentClosed = Boolean(parent && !parent.active);
          return (
            <div className="ad-col" key={level}>
              <div className="ad-col-head"><h3>{LEVEL_TITLE[level]}</h3>{!needsParent && <span>{total}</span>}</div>
              {parent && <p className="ad-col-context" title={locationPath(parent, locations)}>in {parent.name}</p>}
              {!needsParent && total > 5 && (
                <label className="ad-col-search"><Icon name="search" size={15} /><span className="sr-only">Search {LEVEL_TITLE[level].toLowerCase()}</span>
                  <input type="search" value={search[level] ?? ""} placeholder={"Search " + LEVEL_TITLE[level].toLowerCase()} onChange={(event) => setSearch((current) => ({ ...current, [level]: event.target.value }))} />
                </label>
              )}
              {needsParent ? (
                <p className="ad-col-empty">Choose {withArticle(LEVEL_NAME[LEVELS[LEVELS.indexOf(level) - 1]])} first</p>
              ) : items.length === 0 ? (
                <p className="ad-col-empty">{query ? "Nothing matches" : `No ${LEVEL_TITLE[level].toLowerCase()} yet`}</p>
              ) : (
                <ul className="ad-col-list" aria-label={LEVEL_TITLE[level]}>
                  {items.map((item) => {
                    const isSelected = selected[level] === item.id;
                    const doctors = item.usage?.doctors ?? 0;
                    return (
                      <li key={item.id} className={`${isSelected ? "is-selected" : ""}${item.active ? "" : " is-inactive"}`}>
                        <button type="button" className="ad-col-item" aria-pressed={isSelected} onClick={() => choose(level, item.id)}>
                          <span className="ad-col-name">{item.name}</span>
                          <span className="ad-col-meta">{item.active ? plural(doctors, "doctor") : "Inactive"}</span>
                          {level !== "office" && <Icon name="arrow-right" size={14} className="ad-col-chevron" />}
                        </button>
                        <div className="ad-col-menu">
                          <button type="button" className="ad-icon-button" aria-label={`Actions for ${item.name}`} aria-haspopup="menu" aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}>⋯</button>
                          {menu === item.id && (
                            <ul className="ad-menu" role="menu">
                              <li role="none"><button type="button" role="menuitem" onClick={() => open({ mode: "rename", item })}>Rename</button></li>
                              <li role="none">{item.active
                                ? <button type="button" role="menuitem" className="is-danger" onClick={() => open({ mode: "deactivate", item })}>Deactivate</button>
                                : <button type="button" role="menuitem" onClick={() => void reactivate(item)}>Reactivate</button>}</li>
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" className="ad-col-add" disabled={needsParent || parentClosed} title={parentClosed ? `${parent!.name} is inactive` : undefined} onClick={() => open({ mode: "add", level, parent })}>
                <span aria-hidden="true">+</span> Add {LEVEL_NAME[level]}
              </button>
            </div>
          );
        })}
      </div>

      {pending && (pending.mode === "deactivate" ? (
        <AdminDialog title={`Deactivate ${pending.item.name}?`} onClose={() => setPending(null)}
          description={`This ${LEVEL_NAME[pending.item.kind]} is hidden from patients and from office lists. Nothing is deleted; you can reactivate it later.`}>
          <form onSubmit={submit} className="ad-dialog-body">
            <ul className="ad-dialog-facts">
              <li><strong>{plural(pending.item.usage?.doctors ?? 0, "doctor")}</strong> work here. They stay assigned but patients will not find them until they move to an active office.</li>
              <li><strong>{plural(pending.item.usage?.slots ?? 0, "time slot")}</strong> belong to those doctors. Booked visits keep their place.</li>
            </ul>
            {dialogError && <p className="ad-form-error" role="alert">{dialogError}</p>}
            <div className="ad-dialog-actions"><button type="button" className="ad-button ad-button-outline" onClick={() => setPending(null)}>Cancel</button><button type="submit" className="ad-button ad-button-danger" disabled={busy}>{busy ? "Deactivating…" : "Deactivate"}</button></div>
          </form>
        </AdminDialog>
      ) : (
        <AdminDialog
          title={pending.mode === "add" ? `Add ${withArticle(LEVEL_NAME[pending.level])}` : `Rename ${LEVEL_NAME[pending.item.kind]}`}
          description={pending.mode === "add"
            ? (pending.parent ? <>In {locationPath(pending.parent, locations)}</> : "A top-level place. Clinics are added inside it.")
            : <>{locationPath(pending.item, locations)}. Doctors placed here show the new name to patients.</>}
          onClose={() => setPending(null)}>
          <form onSubmit={submit} className="ad-dialog-body">
            <label className="ad-dialog-field">{(pending.mode === "add" ? LEVEL_NAME[pending.level] : LEVEL_NAME[pending.item.kind]).replace(/^./, (letter) => letter.toUpperCase())} name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder={LEVEL_EXAMPLE[pending.mode === "add" ? pending.level : pending.item.kind]} />
            </label>
            {dialogError && <p className="ad-form-error" role="alert">{dialogError}</p>}
            <div className="ad-dialog-actions"><button type="button" className="ad-button ad-button-outline" onClick={() => setPending(null)}>Cancel</button><button type="submit" className="ad-button" disabled={busy || !name.trim() || (pending.mode === "rename" && name.trim() === pending.item.name)}>{busy ? "Saving…" : pending.mode === "add" ? "Add" : "Save"}</button></div>
          </form>
        </AdminDialog>
      ))}
    </section>
  );
}

/** Doctors and their offices: search, filter by specialty, and change an office through four linked choices. */
export function DoctorOffices({ doctors, locations, onSaved }: { doctors: OfficeDoctor[]; locations: RefLocation[]; onSaved: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [placement, setPlacement] = useState("");
  const [editing, setEditing] = useState<OfficeDoctor | null>(null);
  const [choice, setChoice] = useState<Partial<Record<LocationLevel, string>>>({});
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const specialties = useMemo(() => [...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean) as string[])].sort(), [doctors]);
  const officeLabel = (doctor: OfficeDoctor) => { const office = doctor.locationId ? locations.find((item) => item.id === doctor.locationId) : undefined; return office ? locationPath(office, locations) : null; };
  const visible = doctors.filter((doctor) => {
    const text = query.trim().toLocaleLowerCase();
    if (text && !doctor.name.toLocaleLowerCase().includes(text) && !(officeLabel(doctor) ?? "").toLocaleLowerCase().includes(text)) return false;
    if (specialty && doctor.specialty !== specialty) return false;
    if (placement === "assigned" && !doctor.locationId) return false;
    if (placement === "unassigned" && doctor.locationId) return false;
    return true;
  });
  const assigned = doctors.filter((doctor) => doctor.locationId).length;

  function start(doctor: OfficeDoctor) {
    const next: Partial<Record<LocationLevel, string>> = {};
    for (let node = doctor.locationId ? locations.find((item) => item.id === doctor.locationId) : undefined; node; node = node.parentId ? locations.find((item) => item.id === node!.parentId) : undefined) next[node.kind] = node.id;
    setChoice(next);
    setDialogError("");
    setEditing(doctor);
  }
  const optionsFor = (level: LocationLevel) => {
    const index = LEVELS.indexOf(level);
    const parentId = index === 0 ? null : choice[LEVELS[index - 1]];
    if (index > 0 && !parentId) return [];
    return locations.filter((item) => item.kind === level && item.parentId === (parentId ?? null) && item.active).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  };
  function pick(level: LocationLevel, id: string) {
    const index = LEVELS.indexOf(level);
    setChoice((current) => { const next: Partial<Record<LocationLevel, string>> = {}; LEVELS.slice(0, index).forEach((key) => { next[key] = current[key]; }); if (id) next[level] = id; return next; });
  }
  async function save(locationId: string | null) {
    if (!editing) return;
    setBusy(true);
    setDialogError("");
    try {
      await api("/admin/doctors/" + encodeURIComponent(editing.id) + "/location", { method: "PATCH", body: JSON.stringify({ locationId }) });
      toast.success(locationId ? `${editing.name} moved` : `${editing.name} unassigned`);
      await onSaved();
      setEditing(null);
    } catch (caught) {
      setDialogError(errorText(caught, "The office could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel ad-panel" aria-labelledby="ad-doctor-offices-heading">
      <div className="admin-panel-header"><div><h2 id="ad-doctor-offices-heading">Doctor offices</h2><p className="ad-muted">{assigned} of {plural(doctors.length, "doctor")} have an office · patients see it on the doctor's profile</p></div></div>
      <div className="ad-filter-row">
        <label className="ad-col-search ad-filter-search"><Icon name="search" size={15} /><span className="sr-only">Search doctors</span><input type="search" value={query} placeholder="Search doctor or office" onChange={(event) => setQuery(event.target.value)} /></label>
        <label><span className="sr-only">Specialty</span><select className="ad-select" value={specialty} onChange={(event) => setSpecialty(event.target.value)}><option value="">All specialties</option>{specialties.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">Office</span><select className="ad-select" value={placement} onChange={(event) => setPlacement(event.target.value)}><option value="">With and without office</option><option value="assigned">With an office</option><option value="unassigned">Without an office</option></select></label>
      </div>
      {visible.length === 0 ? <p className="ad-empty-state">No doctors match.</p> : (
        <div className="table-wrap ad-scroll"><table className="admin-table"><thead><tr><th>Doctor</th><th>Office</th><th aria-label="Actions" /></tr></thead><tbody>
          {visible.map((doctor) => {
            const label = officeLabel(doctor);
            return (
              <tr key={doctor.id}>
                <td><strong>{doctor.name}</strong>{doctor.specialty && <small className="ad-cell-sub">{doctor.specialty}</small>}</td>
                <td>{label ?? <span className="ad-muted-cell">Unassigned</span>}</td>
                <td className="ad-cell-action"><button type="button" className="ad-button ad-button-outline ad-button-small" onClick={() => start(doctor)}>{label ? "Change" : "Assign"}</button></td>
              </tr>
            );
          })}
        </tbody></table></div>
      )}

      {editing && (
        <AdminDialog title={`Office for ${editing.name}`} description={officeLabel(editing) ? <>Now: {officeLabel(editing)}</> : "No office yet"} onClose={() => setEditing(null)}>
          <form className="ad-dialog-body" onSubmit={(event) => { event.preventDefault(); if (choice.office) void save(choice.office); }}>
            {LEVELS.map((level, index) => {
              const options = optionsFor(level);
              const blocked = index > 0 && !choice[LEVELS[index - 1]];
              return (
                <label key={level} className="ad-dialog-field">{LEVEL_NAME[level].replace(/^./, (letter) => letter.toUpperCase())}
                  <select className="ad-select" value={choice[level] ?? ""} disabled={blocked || options.length === 0} onChange={(event) => pick(level, event.target.value)}>
                    <option value="">{blocked ? `Choose ${withArticle(LEVEL_NAME[LEVELS[index - 1]])} first` : options.length === 0 ? `No active ${LEVEL_TITLE[level].toLowerCase()}` : `Choose ${withArticle(LEVEL_NAME[level])}`}</option>
                    {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              );
            })}
            {dialogError && <p className="ad-form-error" role="alert">{dialogError}</p>}
            <div className="ad-dialog-actions">
              {editing.locationId && <button type="button" className="ad-button ad-button-outline ad-dialog-left" disabled={busy} onClick={() => void save(null)}>Remove from office</button>}
              <button type="button" className="ad-button ad-button-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="ad-button" disabled={busy || !choice.office || choice.office === editing.locationId}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </AdminDialog>
      )}
    </section>
  );
}
