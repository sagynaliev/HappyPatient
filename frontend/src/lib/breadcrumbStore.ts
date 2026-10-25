import { useEffect, useSyncExternalStore } from "react";

/**
 * Pages that know a human name for the current URL (for example the doctor's name on
 * /doctors/:id) publish it here so the breadcrumb can show "Dr. Aibek Akhmetov" instead of an id.
 */
let labels: Record<string, string> = {};
const listeners = new Set<() => void>();

function emit() { listeners.forEach((listener) => listener()); }

export function setBreadcrumbLabel(key: string, label: string | undefined) {
  if (!label) { if (key in labels) { const next = { ...labels }; delete next[key]; labels = next; emit(); } return; }
  if (labels[key] === label) return;
  labels = { ...labels, [key]: label };
  emit();
}

export function useBreadcrumbLabels() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => labels,
    () => labels,
  );
}

/** Render-anywhere helper: <BreadcrumbLabel id="doctor" label="Dr. X" /> */
export function BreadcrumbLabel({ id, label }: { id: string; label?: string }) {
  useEffect(() => {
    setBreadcrumbLabel(id, label);
    return () => setBreadcrumbLabel(id, undefined);
  }, [id, label]);
  return null;
}
