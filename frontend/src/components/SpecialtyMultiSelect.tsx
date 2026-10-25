import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, IconName } from "./Icons";

const ICONS: IconName[] = ["heart", "stethoscope", "user", "shield", "spark", "file", "clock", "users", "chart", "pin"];

type Props = {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  counts?: Record<string, number>;
  disabled?: boolean;
};

/** Multi-select for specialties: chips in the field, a searchable checklist in the popover. */
export default function SpecialtyMultiSelect({ options, value, onChange, counts = {}, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const visible = useMemo(() => {
    const term = filter.trim().toLocaleLowerCase();
    return options.filter((name) => !term || name.toLocaleLowerCase().includes(term));
  }, [options, filter]);

  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((item) => item !== name) : [...value, name]);

  return (
    <div className="sms" ref={rootRef}>
      <div className={`sms-field${open ? " is-open" : ""}`}>
        <div className="sms-chips">
          {value.length === 0 && <span className="sms-placeholder">All specialties</span>}
          {value.map((name) => (
            <span className="sms-chip" key={name}>
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => toggle(name)} disabled={disabled}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
              </button>
            </span>
          ))}
        </div>
        <button type="button" className="sms-toggle" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label="Specialties" onClick={() => setOpen((current) => !current)} disabled={disabled}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
        </button>
      </div>

      {open && (
        <div className="sms-popover">
          <label className="sms-search">
            <Icon name="search" size={16} />
            <span className="sr-only">Filter specialties</span>
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Type a specialty" autoFocus />
          </label>
          <ul className="sms-list" id={listId} role="listbox" aria-multiselectable="true" aria-label="Specialties">
            {visible.map((name) => {
              const selected = value.includes(name);
              const count = counts[name] ?? 0;
              return (
                <li key={name} role="option" aria-selected={selected}>
                  <label className={`sms-option${selected ? " is-selected" : ""}${count === 0 ? " is-empty" : ""}`}>
                    <span className="sms-option-icon"><Icon name={ICONS[options.indexOf(name) % ICONS.length]} size={18} /></span>
                    <span className="sms-option-name">{name}</span>
                    <span className="sms-count" title="Doctors with free time on this day">{count}</span>
                    <input type="checkbox" checked={selected} onChange={() => toggle(name)} aria-label={name} />
                    <span className="sms-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                  </label>
                </li>
              );
            })}
            {visible.length === 0 && <li className="sms-none">No specialty matches “{filter}”.</li>}
          </ul>
          <div className="sms-footer">
            <button type="button" onClick={() => onChange([])} disabled={value.length === 0}>Clear</button>
            <button type="button" className="is-primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
