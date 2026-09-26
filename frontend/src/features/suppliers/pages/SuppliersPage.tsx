import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field } from "../../../components/ui/Field";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import { type Supplier, type SupplierInput, suppliersApi } from "../api/suppliersApi";

const emptyForm = (): SupplierInput => ({
  supplierCode: "", supplierName: "", isActive: true, contactName: "", phone: "", mobile: "", email: "",
  addressLine1: "", addressLine2: "", city: "", districtOrState: "", postalCode: "", countryCode: "",
});
const toForm = (supplier: Supplier): SupplierInput => ({
  supplierCode: supplier.supplierCode, supplierName: supplier.supplierName, isActive: supplier.isActive,
  contactName: supplier.contactName ?? "", phone: supplier.phone ?? "", mobile: supplier.mobile ?? "", email: supplier.email ?? "",
  addressLine1: supplier.addressLine1 ?? "", addressLine2: supplier.addressLine2 ?? "", city: supplier.city ?? "",
  districtOrState: supplier.districtOrState ?? "", postalCode: supplier.postalCode ?? "", countryCode: supplier.countryCode ?? "",
});

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierInput>(emptyForm);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [apiError, setApiError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const suppliers = useQuery({
    queryKey: ["suppliers", page, limit, debouncedSearch, statusFilter],
    queryFn: () => suppliersApi.page({ page, limit, search: debouncedSearch, status: statusFilter }),
  });
  const reset = () => {
    setEditing(null);
    setForm(emptyForm());
    setApiError("");
    setFieldErrors([]);
    setLoadingEdit(false);
    save.reset();
  };
  const close = () => { setOpen(false); reset(); };
  const create = () => { reset(); setSuccess(""); setOpen(true); };
  const edit = async (row: Supplier) => {
    reset();
    setEditing(row);
    setSuccess("");
    setOpen(true);
    setLoadingEdit(true);
    try {
      const current = await suppliersApi.get(row.supplierId);
      setEditing(current);
      setForm(toForm(current));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to load supplier.");
    } finally {
      setLoadingEdit(false);
    }
  };
  const save = useMutation({
    mutationFn: ({ data, id }: { data: SupplierInput; id?: number }) => {
      if (!id) return suppliersApi.create(data);
      const { supplierCode: _readOnlyCode, ...updateData } = data;
      return suppliersApi.update(id, updateData);
    },
    onSuccess: async (_row, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setSuccess(variables.id ? "Supplier updated successfully." : "Supplier created successfully.");
      close();
    },
    onError: (error: Error) => setApiError(error.message || "Unable to save supplier."),
  });
  const status = useMutation({
    mutationFn: ({ supplierId, activate }: { supplierId: number; activate: boolean }) => activate
      ? suppliersApi.update(supplierId, { isActive: true })
      : suppliersApi.deactivate(supplierId),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setSuccess(`Supplier ${row.isActive ? "activated" : "deactivated"} successfully.`);
    },
  });
  const change = (key: keyof SupplierInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setApiError("");
    if (key === "supplierCode") save.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors: string[] = [];
    if (!form.supplierName.trim()) errors.push("Supplier name is required.");
    if (form.countryCode && form.countryCode.length !== 2) errors.push("Country must be a two-letter code.");
    if (errors.length) { setFieldErrors(errors); return; }
    setFieldErrors([]);
    setApiError("");
    const data = {
      ...form,
      supplierCode: form.supplierCode?.trim().toUpperCase() || undefined,
      supplierName: form.supplierName.trim(),
      countryCode: form.countryCode?.toUpperCase() || "",
    };
    save.mutate({ data, id: editing?.supplierId });
  };

  const rows = suppliers.data?.items ?? [];
  return (
    <div>
      <div className="page-head">
        <div><h1>Suppliers</h1><p>Supplier master data with one optional contact and address.</p></div>
        {permissions.includes("SUPPLIER_CREATE") && <button className="btn btn-primary" onClick={create}>+ New supplier</button>}
      </div>
      {success && <div className="success-box">{success}</div>}
      <div className="card">
        {(suppliers.error || status.error) && <div className="error-box">{((suppliers.error ?? status.error) as Error).message}</div>}
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input className="input search" placeholder="Search by supplier code, name, contact, phone, or city" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="control" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <button className="btn btn-secondary" onClick={() => suppliers.refetch()}>↻ Refresh</button>
        </div>

        <table className="table">
          <thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Phone / Mobile</th><th>City</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {suppliers.isLoading ? (
              <tr><td colSpan={7}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7}><div className="empty">No suppliers found.</div></td></tr>
            ) : rows.map((row) => (
              <tr key={row.supplierId}>
                <td><span className="code-chip">{row.supplierCode}</span></td>
                <td><strong>{row.supplierName}</strong></td>
                <td>{row.contactName || "—"}</td>
                <td>{row.mobile || row.phone || "—"}</td>
                <td>{row.city || "—"}</td>
                <td><span className={row.isActive ? "status status-on" : "status status-off"}><i /> {row.isActive ? "Active" : "Inactive"}</span></td>
                <td className="right">
                  {permissions.includes("SUPPLIER_UPDATE") && <button className="btn btn-ghost" disabled={status.isPending} onClick={() => edit(row)}>Edit</button>}{" "}
                  {row.isActive && permissions.includes("SUPPLIER_DEACTIVATE") && <button className="btn btn-danger-soft" disabled={status.isPending} onClick={() => status.mutate({ supplierId: row.supplierId, activate: false })}>Deactivate</button>}
                  {!row.isActive && permissions.includes("SUPPLIER_UPDATE") && <button className="btn btn-primary" disabled={status.isPending} onClick={() => status.mutate({ supplierId: row.supplierId, activate: true })}>Activate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="toolbar">
          <span>Showing {suppliers.data?.total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, suppliers.data?.total ?? 0)} of {suppliers.data?.total ?? 0} suppliers</span>
          <div>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
            {Array.from({ length: suppliers.data?.totalPages ?? 1 }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === suppliers.data?.totalPages || Math.abs(number - page) <= 1)
              .map((number, index, visible) => <span key={number}>{index > 0 && number - visible[index - 1] > 1 ? " … " : " "}<button className={number === page ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setPage(number)}>{number}</button></span>)}{" "}
            <button className="btn btn-secondary" disabled={page >= (suppliers.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</button>{" "}
            <select className="control" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>
          </div>
        </div>
      </div>

      <Modal open={open} onClose={close} title={editing ? "Edit supplier" : "Create supplier"} subtitle="General, contact, and address details." wide>
        <form onSubmit={submit}>
          <div className="modal-body supplier-form-body">
            {loadingEdit ? <div className="empty">Loading supplier...</div> : <>
              <section className="form-section"><h3>General</h3><div className="form-grid"><Field label="Code" value={form.supplierCode} onChange={(value) => change("supplierCode", value.toUpperCase())} disabled={Boolean(editing)} placeholder="Leave blank to auto-generate SUP-000001" hint={editing ? "Supplier code cannot be changed after creation." : "Leave blank to auto-generate SUP-000001"} /><Field label="Name" value={form.supplierName} onChange={(value) => change("supplierName", value)} required /><label className="check"><input type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} /> Active</label></div></section>
              <section className="form-section"><h3>Contact</h3><div className="form-grid"><Field label="Contact name" value={form.contactName} onChange={(value) => change("contactName", value)} /><Field label="Phone" value={form.phone} onChange={(value) => change("phone", value)} /><Field label="Mobile" value={form.mobile} onChange={(value) => change("mobile", value)} /><Field label="Email" type="email" value={form.email} onChange={(value) => change("email", value)} /></div></section>
              <section className="form-section"><h3>Address</h3><div className="form-grid"><Field label="Address line 1" value={form.addressLine1} onChange={(value) => change("addressLine1", value)} /><Field label="Address line 2" value={form.addressLine2} onChange={(value) => change("addressLine2", value)} /><Field label="City" value={form.city} onChange={(value) => change("city", value)} /><Field label="District / State" value={form.districtOrState} onChange={(value) => change("districtOrState", value)} /><Field label="Postal code" value={form.postalCode} onChange={(value) => change("postalCode", value)} /><Field label="Country" value={form.countryCode} onChange={(value) => change("countryCode", value.toUpperCase().slice(0, 2))} placeholder="LK" /></div></section>
              {fieldErrors.map((error) => <div className="error-text" key={error}>{error}</div>)}
              {apiError && <div className="error-box">{apiError}</div>}
            </>}
          </div>
          <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={save.isPending || loadingEdit}>{save.isPending ? "Saving..." : "Save supplier"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
