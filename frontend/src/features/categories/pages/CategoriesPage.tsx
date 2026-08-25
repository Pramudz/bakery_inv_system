import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { categoriesApi } from "../api/categoriesApi";

const categoryId = (row: any) => Number(row.categoryId ?? row.id);

export function CategoriesPage() {
  const qc = useQueryClient();
  const { permissions } = useAuth();
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

  const categories = useQuery({
    queryKey: ["categories", page, limit, debouncedSearch, statusFilter],
    queryFn: () => categoriesApi.page({ page, limit, search: debouncedSearch, status: statusFilter }),
  });
  const categoryOptions = useQuery({
    queryKey: ["categories", "all"],
    queryFn: categoriesApi.list,
  });

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => editing
      ? categoriesApi.update(categoryId(editing), data)
      : categoriesApi.create(data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["categories"] });
      setOpen(false);
      setEditing(null);
      setForm({});
    },
  });
  const toggleActive = useMutation({
    mutationFn: (row: any) => row.isActive !== false
      ? categoriesApi.deactivate(categoryId(row))
      : categoriesApi.activate(categoryId(row)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const rows = categories.data?.items ?? [];
  const busy = save.isPending || toggleActive.isPending;
  const startCreate = () => {
    setEditing(null);
    setForm({});
    setOpen(true);
  };
  const startEdit = (row: any) => {
    setEditing(row);
    setForm({ ...row });
    setOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      ...(form.parentCategoryId === ""
        ? { parentCategoryId: null }
        : form.parentCategoryId !== undefined
          ? { parentCategoryId: Number(form.parentCategoryId) }
          : {}),
      categoryCode: form.categoryCode,
      categoryName: form.categoryName,
      ...(form.description !== undefined && form.description !== "" ? { description: form.description } : {}),
      ...(form.sortOrder !== undefined && form.sortOrder !== "" ? { sortOrder: Number(form.sortOrder) } : {}),
    });
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Categories</h1>
          <p>Hierarchical product categories.</p>
        </div>
        {permissions.includes("CATEGORY_CREATE") && (
          <button className="btn btn-primary" onClick={startCreate}>+ New</button>
        )}
      </div>

      <div className="card">
        {(categories.error || toggleActive.error) && (
          <div className="error-box">{((categories.error ?? toggleActive.error) as Error).message}</div>
        )}
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input
              className="input search"
              placeholder="Search code or category name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="control"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn btn-secondary" onClick={() => categories.refetch()}>↻ Refresh</button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.isLoading ? (
              <tr><td colSpan={5}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5}><div className="empty">No categories found.</div></td></tr>
            ) : rows.map((row: any) => (
              <tr key={categoryId(row)}>
                <td>{row.tenant?.name ?? "—"}</td>
                <td><span className="code-chip">{row.categoryCode}</span></td>
                <td>{row.categoryName}</td>
                <td>
                  <span className={row.isActive !== false ? "status status-on" : "status status-off"}>
                    <i /> {row.isActive !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="right">
                  {permissions.includes("CATEGORY_UPDATE") && (
                    <button className="btn btn-ghost" disabled={busy} onClick={() => startEdit(row)}>Edit</button>
                  )}{" "}
                  {permissions.includes("CATEGORY_DEACTIVATE") && (
                    <button className="btn btn-ghost" disabled={busy} onClick={() => toggleActive.mutate(row)}>
                      {row.isActive !== false ? "Deactivate" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="toolbar">
          <span>
            Showing {categories.data?.total ? (page - 1) * limit + 1 : 0}–
            {Math.min(page * limit, categories.data?.total ?? 0)} of {categories.data?.total ?? 0} categories
          </span>
          <div>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
            {Array.from({ length: categories.data?.totalPages ?? 1 }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === categories.data?.totalPages || Math.abs(number - page) <= 1)
              .map((number, index, visible) => (
                <span key={number}>
                  {index > 0 && number - visible[index - 1] > 1 ? " … " : " "}
                  <button className={number === page ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setPage(number)}>{number}</button>
                </span>
              ))}{" "}
            <button className="btn btn-secondary" disabled={page >= (categories.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</button>{" "}
            <select
              className="control"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {open && (
        <div className="modal-bg">
          <div className="modal">
            <form onSubmit={submit}>
              <div className="modal-head"><h2>{editing ? "Edit" : "Create"} Category</h2></div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field">
                    <label>Parent category</label>
                    <select className="select" value={form.parentCategoryId ?? ""} onChange={(event) => setForm({ ...form, parentCategoryId: event.target.value })}>
                      <option value="">Select...</option>
                      {(categoryOptions.data ?? []).filter((category: any) => categoryId(category) !== (editing ? categoryId(editing) : 0)).map((category: any) => (
                        <option key={categoryId(category)} value={categoryId(category)}>{category.categoryName} ({category.categoryCode})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field"><label>Code</label><input type="text" required value={form.categoryCode ?? ""} onChange={(event) => setForm({ ...form, categoryCode: event.target.value })} /></div>
                  <div className="field"><label>Name</label><input type="text" required value={form.categoryName ?? ""} onChange={(event) => setForm({ ...form, categoryName: event.target.value })} /></div>
                  <div className="field"><label>Description</label><input type="text" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
                  <div className="field"><label>Sort order</label><input type="number" value={form.sortOrder ?? ""} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></div>
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
