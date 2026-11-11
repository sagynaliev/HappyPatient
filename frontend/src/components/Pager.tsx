import { useEffect, useMemo, useState } from "react";

/** Cuts a long list into pages; going back to page 1 whenever the list itself changes (search, filter). */
export function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { setPage(1); }, [items]);
  const current = Math.min(page, pages);
  const visible = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return { visible, page: current, pages, setPage, total: items.length, from: items.length ? (current - 1) * pageSize + 1 : 0, to: Math.min(current * pageSize, items.length) };
}

/** Previous / next with a plain "11–20 of 303" count, so a table never grows past one screen. */
export function Pager({ page, pages, from, to, total, onPage, label }: { page: number; pages: number; from: number; to: number; total: number; onPage: (page: number) => void; label: string }) {
  if (total === 0) return null;
  return (
    <nav className="pager" aria-label={`${label} pages`}>
      <span className="pager-count" aria-live="polite">{from}–{to} of {total}</span>
      <div className="pager-buttons">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>← Previous</button>
        <span className="pager-page">Page {page} of {pages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next →</button>
      </div>
    </nav>
  );
}
