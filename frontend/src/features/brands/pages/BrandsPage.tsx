import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandsApi } from "../api/brandsApi";

const brandId = (row: any) => Number(row.brandId ?? row.id);

export function BrandsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const brands = useQuery({
    queryKey: ["brands", page, limit, debouncedSearch, statusFilter],
    queryFn: () => brandsApi.page({ page, limit, search: debouncedSearch, status: statusFilter }),
  });
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => editing
      ? brandsApi.update(brandId(editing), data)
      : brandsApi.create(data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["brands"] });
      setOpen(false);
      setEditing(null);
      setForm({});
    },
  });
  const toggleActive = useMutation({
    mutationFn: (row: any) => row.isActive !== false
      ? brandsApi.deactivate(brandId(row))
      : brandsApi.activate(brandId(row)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brands"] }),
  });

  const rows = brands.data?.items ?? [];
  const startCreate = () => {
    setEditing(null);
    setForm({});
    save.reset();
    setOpen(true);
  };
  const startEdit = (row: any) => {
    setEditing(row);
    setForm({ ...row });
    save.reset();
    setOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      brandCode: form.brandCode,
      brandName: form.brandName,
      ...(form.description !== undefined && form.description !== "" ? { description: form.description } : {}),
    });
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Brands</h1>
          <p>Product brands.</p>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>+ New</button>
      </div>

      <div className="card">
        {(brands.error || toggleActive.error) && (
          <div className="error-box">{((brands.error ?? toggleActive.error) as Error).message}</div>
        )}
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input
              className="input search"
              placeholder="Search by brand code or name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select className="control" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn btn-secondary" onClick={() => brands.refetch()}>↻ Refresh</button>
        </div>

        <table className="table">
          <thead><tr><th>Tenant</th><th>Code</th><th>Name</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {brands.isLoading ? (
              <tr><td colSpan={5}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5}><div className="empty">No brands found.</div></td></tr>
            ) : rows.map((row: any) => (
              <tr key={brandId(row)}>
                <td>{row.tenant?.name ?? "—"}</td>
                <td><span className="code-chip">{row.brandCode}</span></td>
                <td>{row.brandName}</td>
                <td><span className={row.isActive !== false ? "status status-on" : "status status-off"}><i /> {row.isActive !== false ? "Active" : "Inactive"}</span></td>
                <td className="right">
                  <button className="btn btn-ghost" disabled={toggleActive.isPending} onClick={() => startEdit(row)}>Edit</button>{" "}
                  <button className="btn btn-ghost" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(row)}>{row.isActive !== false ? "Deactivate" : "Activate"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="toolbar">
          <span>Showing {brands.data?.total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, brands.data?.total ?? 0)} of {brands.data?.total ?? 0} brands</span>
          <div>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
            {Array.from({ length: brands.data?.totalPages ?? 1 }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === brands.data?.totalPages || Math.abs(number - page) <= 1)
              .map((number, index, visible) => <span key={number}>{index > 0 && number - visible[index - 1] > 1 ? " … " : " "}<button className={number === page ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setPage(number)}>{number}</button></span>)}{" "}
            <button className="btn btn-secondary" disabled={page >= (brands.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</button>{" "}
            <select className="control" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
              <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {open && (
        <div className="modal-bg">
          <div className="modal">
            <form onSubmit={submit}>
              <div className="modal-head"><h2>{editing ? "Edit" : "Create"} Brand</h2></div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field"><label>Code</label><input type="text" required value={form.brandCode ?? ""} onChange={(event) => setForm({ ...form, brandCode: event.target.value })} /></div>
                  <div className="field"><label>Name</label><input type="text" required value={form.brandName ?? ""} onChange={(event) => setForm({ ...form, brandName: event.target.value })} /></div>
                  <div className="field"><label>Description</label><input type="text" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
                </div>
                {save.isError && <div className="error">{(save.error as Error).message}</div>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
