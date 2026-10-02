import { useEffect, useState } from "react";

export function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export function PosPagination({ page, limit, total, onPage, onLimit }: { page: number; limit: number; total: number; onPage: (page: number) => void; onLimit: (limit: 20 | 50 | 100) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  useEffect(() => { if (page > pages) onPage(pages); }, [page, pages, onPage]);
  return <div className="pos-list-pagination">
    <span>{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : "0 records"}</span>
    <label>Rows <select className="control" value={limit} onChange={(event) => { onLimit(Number(event.target.value) as 20 | 50 | 100); onPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
    <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
    <span>Page {page} of {pages}</span>
    <button className="btn btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
  </div>;
}

export function PosSearch({ value, onChange, placeholder = "Search" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="pos-list-search"><span className="sr-only">Search</span><input className="control" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
