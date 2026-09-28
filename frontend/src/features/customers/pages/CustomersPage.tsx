import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field } from "../../../components/ui/Field";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import { type Customer, type CustomerInput, customersApi } from "../api/customersApi";

const emptyForm = (): CustomerInput => ({
  customerCode: "", customerName: "", isActive: true, contactName: "", phone: "", mobile: "", email: "",
  addressLine1: "", addressLine2: "", city: "", districtOrState: "",
});
const toForm = (customer: Customer): CustomerInput => ({
  customerCode: customer.customerCode, customerName: customer.customerName, isActive: customer.isActive,
  contactName: customer.contactName ?? "", phone: customer.phone ?? "", mobile: customer.mobile ?? "", email: customer.email ?? "",
  addressLine1: customer.addressLine1 ?? "", addressLine2: customer.addressLine2 ?? "", city: customer.city ?? "",
  districtOrState: customer.districtOrState ?? "",
});

export function CustomersPage() {
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
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

  const customers = useQuery({
    queryKey: ["customers", page, limit, debouncedSearch, statusFilter],
    queryFn: () => customersApi.page({ page, limit, search: debouncedSearch, status: statusFilter }),
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
  const edit = async (row: Customer) => {
    reset();
    setEditing(row);
    setSuccess("");
    setOpen(true);
    setLoadingEdit(true);
    try {
      const current = await customersApi.get(row.customerId);
      setEditing(current);
      setForm(toForm(current));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to load customer.");
    } finally {
      setLoadingEdit(false);
    }
  };
  const save = useMutation({
    mutationFn: ({ data, id }: { data: CustomerInput; id?: number }) => {
      if (!id) return customersApi.create(data);
      const { customerCode: _readOnlyCode, ...updateData } = data;
      return customersApi.update(id, updateData);
    },
    onSuccess: async (_row, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setSuccess(variables.id ? "Customer updated successfully." : "Customer created successfully.");
      close();
    },
    onError: (error: Error) => setApiError(error.message || "Unable to save customer."),
  });
  const status = useMutation({
    mutationFn: ({ customerId, activate }: { customerId: number; activate: boolean }) => activate
      ? customersApi.update(customerId, { isActive: true })
      : customersApi.deactivate(customerId),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setSuccess(`Customer ${row.isActive ? "activated" : "deactivated"} successfully.`);
    },
  });
  const change = (key: keyof CustomerInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setApiError("");
    if (key === "customerCode") save.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors: string[] = [];
    if (!form.customerCode.trim()) errors.push("Customer code is required.");
    if (!form.customerName.trim()) errors.push("Customer name is required.");
    if (errors.length) { setFieldErrors(errors); return; }
    setFieldErrors([]);
    setApiError("");
    const data = {
      ...form,
      customerCode: form.customerCode.trim().toUpperCase(),
      customerName: form.customerName.trim(),
    };
    save.mutate({ data, id: editing?.customerId });
  };

  const rows = customers.data?.items ?? [];
  return (
    <div>
      <div className="page-head">
        <div><h1>Customers</h1><p>Customer master data with one optional contact and address.</p></div>
        {permissions.includes("CUSTOMER_CREATE") && <button className="btn btn-primary" onClick={create}>+ New customer</button>}
      </div>
      {success && <div className="success-box">{success}</div>}
      <div className="card">
        {(customers.error || status.error) && <div className="error-box">{((customers.error ?? status.error) as Error).message}</div>}
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input className="input search" placeholder="Search by customer code, name, contact, phone, or city" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="control" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <button className="btn btn-secondary" onClick={() => customers.refetch()}>↻ Refresh</button>
        </div>

        <table className="table">
          <thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Phone / Mobile</th><th>City</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {customers.isLoading ? (
              <tr><td colSpan={7}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7}><div className="empty">No customers found.</div></td></tr>
            ) : rows.map((row) => (
              <tr key={row.customerId}>
                <td><span className="code-chip">{row.customerCode}</span></td>
                <td><strong>{row.customerName}</strong></td>
                <td>{row.contactName || "—"}</td>
                <td>{row.mobile || row.phone || "—"}</td>
                <td>{row.city || "—"}</td>
                <td><span className={row.isActive ? "status status-on" : "status status-off"}><i /> {row.isActive ? "Active" : "Inactive"}</span></td>
                <td className="right">
                  {permissions.includes("CUSTOMER_UPDATE") && <button className="btn btn-ghost" disabled={status.isPending} onClick={() => edit(row)}>Edit</button>}{" "}
                  {row.isActive && permissions.includes("CUSTOMER_DEACTIVATE") && <button className="btn btn-danger-soft" disabled={status.isPending} onClick={() => status.mutate({ customerId: row.customerId, activate: false })}>Deactivate</button>}
                  {!row.isActive && permissions.includes("CUSTOMER_UPDATE") && <button className="btn btn-primary" disabled={status.isPending} onClick={() => status.mutate({ customerId: row.customerId, activate: true })}>Activate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="toolbar">
          <span>Showing {customers.data?.total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, customers.data?.total ?? 0)} of {customers.data?.total ?? 0} customers</span>
          <div>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
            {Array.from({ length: customers.data?.totalPages ?? 1 }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === customers.data?.totalPages || Math.abs(number - page) <= 1)
              .map((number, index, visible) => <span key={number}>{index > 0 && number - visible[index - 1] > 1 ? " … " : " "}<button className={number === page ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setPage(number)}>{number}</button></span>)}{" "}
            <button className="btn btn-secondary" disabled={page >= (customers.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</button>{" "}
            <select className="control" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>
          </div>
        </div>
      </div>

      <Modal open={open} onClose={close} title={editing ? "Edit customer" : "Create customer"} subtitle="General, contact, and address details." wide>
        <form onSubmit={submit}>
          <div className="modal-body customer-form-body">
            {loadingEdit ? <div className="empty">Loading customer...</div> : <>
              <section className="form-section"><h3>General</h3><div className="form-grid"><Field label="Code" value={form.customerCode} onChange={(value) => change("customerCode", value.toUpperCase())} disabled={Boolean(editing)} required placeholder="Enter customer code" /><Field label="Name" value={form.customerName} onChange={(value) => change("customerName", value)} required /><label className="check"><input type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} /> Active</label></div></section>
              <section className="form-section"><h3>Contact</h3><div className="form-grid"><Field label="Contact name" value={form.contactName} onChange={(value) => change("contactName", value)} /><Field label="Phone" value={form.phone} onChange={(value) => change("phone", value)} /><Field label="Mobile" value={form.mobile} onChange={(value) => change("mobile", value)} /><Field label="Email" type="email" value={form.email} onChange={(value) => change("email", value)} /></div></section>
              <section className="form-section"><h3>Address</h3><div className="form-grid"><Field label="Address line 1" value={form.addressLine1} onChange={(value) => change("addressLine1", value)} /><Field label="Address line 2" value={form.addressLine2} onChange={(value) => change("addressLine2", value)} /><Field label="City" value={form.city} onChange={(value) => change("city", value)} /><Field label="District / State" value={form.districtOrState} onChange={(value) => change("districtOrState", value)} /></div></section>
              {fieldErrors.map((error) => <div className="error-text" key={error}>{error}</div>)}
              {apiError && <div className="error-box">{apiError}</div>}
            </>}
          </div>
          <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={save.isPending || loadingEdit}>{save.isPending ? "Saving..." : "Save customer"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
