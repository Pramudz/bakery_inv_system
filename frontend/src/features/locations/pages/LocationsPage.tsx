import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field } from "../../../components/ui/Field";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import { LOCATION_TYPES, type Location, type LocationInput, locationsApi } from "../api/locationsApi";

const emptyForm = (): LocationInput => ({
  code: "", name: "", locationType: "STORE", isActive: true, contactPerson: "", email: "", phone: "",
  addressLine1: "", addressLine2: "", city: "", stateProvince: "", postalCode: "", countryCode: "",
});
const toForm = (location: Location): LocationInput => ({
  code: location.code, name: location.name, locationType: location.locationType, isActive: location.isActive,
  contactPerson: location.contactPerson ?? "", email: location.email ?? "", phone: location.phone ?? "",
  addressLine1: location.addressLine1 ?? "", addressLine2: location.addressLine2 ?? "", city: location.city ?? "",
  stateProvince: location.stateProvince ?? "", postalCode: location.postalCode ?? "", countryCode: location.countryCode ?? "",
});
const typeOptions = LOCATION_TYPES.map((value) => ({ value, label: value.replaceAll("_", " ") }));

export function LocationsPage() {
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [viewing, setViewing] = useState<Location | null>(null);
  const [form, setForm] = useState<LocationInput>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [duplicateCode, setDuplicateCode] = useState("");
  const [success, setSuccess] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const locations = useQuery({
    queryKey: ["locations", page, limit, debouncedSearch, statusFilter],
    queryFn: () => locationsApi.page({ page, limit, search: debouncedSearch, status: statusFilter }),
  });
  const reset = () => {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setApiError("");
    setDuplicateCode("");
    setEditLoading(false);
    save.reset();
  };
  const close = () => { setOpen(false); reset(); };
  const startCreate = () => { reset(); setSuccess(""); setOpen(true); };
  const startEdit = async (row: Location) => {
    reset();
    setSuccess("");
    setEditing(row);
    setOpen(true);
    setEditLoading(true);
    try {
      const current = await locationsApi.get(row.locationId);
      setEditing(current);
      setForm(toForm(current));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to load location.");
    } finally {
      setEditLoading(false);
    }
  };
  const save = useMutation({
    mutationFn: ({ data, id }: { data: LocationInput; id?: number }) => id ? locationsApi.update(id, data) : locationsApi.create(data),
    onSuccess: async (_row, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      setSuccess(variables.id ? "Location updated successfully." : "Location created successfully.");
      close();
    },
    onError: (error: Error) => {
      if (error.message.toLowerCase().includes("code already exists")) setDuplicateCode(error.message);
      else setApiError(error.message);
    },
  });
  const status = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => active ? locationsApi.activate(id) : locationsApi.deactivate(id),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      setSuccess(`Location ${row.isActive ? "activated" : "deactivated"} successfully.`);
    },
  });
  const change = (key: keyof LocationInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setApiError("");
    if (key === "code") { setDuplicateCode(""); save.reset(); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.code.trim()) errors.code = "Location code is required.";
    if (!form.name.trim()) errors.name = "Location name is required.";
    if (form.countryCode && form.countryCode.length !== 2) errors.countryCode = "Country code must contain 2 letters.";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setApiError("");
    setDuplicateCode("");
    save.mutate({
      data: { ...form, code: form.code.trim().toUpperCase(), countryCode: form.countryCode?.toUpperCase() },
      id: editing?.locationId,
    });
  };

  const rows = locations.data?.items ?? [];
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Locations</h1>
          <p>Stores, warehouses, offices and distribution centers with their own document addresses.</p>
        </div>
        {permissions.includes("LOCATION_CREATE") && <button className="btn btn-primary" onClick={startCreate}>+ New location</button>}
      </div>
      {success && <div className="success-box">{success}</div>}
      <div className="card">
        {(locations.error || status.error) && <div className="error-box">{((locations.error ?? status.error) as Error).message}</div>}
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input className="input search" placeholder="Search by location code or name" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="control" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn btn-secondary" onClick={() => locations.refetch()}>↻ Refresh</button>
        </div>
        <table className="table">
          <thead><tr><th>Tenant</th><th>Code</th><th>Name</th><th>Type</th><th>Contact</th><th>City</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {locations.isLoading ? (
              <tr><td colSpan={8}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8}><div className="empty">No locations found.</div></td></tr>
            ) : rows.map((row) => (
              <tr key={row.locationId}>
                <td>{row.tenant?.name ?? "—"}</td>
                <td><span className="code-chip">{row.code}</span></td>
                <td><strong>{row.name}</strong></td>
                <td>{row.locationType.replaceAll("_", " ")}</td>
                <td>{row.contactPerson || row.phone || "—"}</td>
                <td>{row.city || "—"}</td>
                <td><span className={row.isActive ? "status status-on" : "status status-off"}><i /> {row.isActive ? "Active" : "Inactive"}</span></td>
                <td className="right">
                  {permissions.includes("LOCATION_VIEW") && <button className="btn btn-ghost" onClick={() => setViewing(row)}>View</button>}{" "}
                  {permissions.includes("LOCATION_UPDATE") && <button className="btn btn-ghost" onClick={() => startEdit(row)}>Edit</button>}{" "}
                  {((row.isActive && permissions.includes("LOCATION_DEACTIVATE")) || (!row.isActive && permissions.includes("LOCATION_UPDATE"))) && (
                    <button className={row.isActive ? "btn btn-danger-soft" : "btn btn-primary"} disabled={status.isPending} onClick={() => status.mutate({ id: row.locationId, active: !row.isActive })}>{row.isActive ? "Deactivate" : "Activate"}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <span>Showing {locations.data?.total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, locations.data?.total ?? 0)} of {locations.data?.total ?? 0} locations</span>
          <div>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
            {Array.from({ length: locations.data?.totalPages ?? 1 }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === locations.data?.totalPages || Math.abs(number - page) <= 1)
              .map((number, index, visible) => <span key={number}>{index > 0 && number - visible[index - 1] > 1 ? " … " : " "}<button className={number === page ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setPage(number)}>{number}</button></span>)}{" "}
            <button className="btn btn-secondary" disabled={page >= (locations.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</button>{" "}
            <select className="control" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
              <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      <Modal open={open} onClose={close} title={editing ? "Edit location" : "Create location"} subtitle="Location identity, contact, and address." wide>
        <form onSubmit={submit}>
          <div className="modal-body tenant-form-body">
            {editLoading ? <div className="empty">Loading location data...</div> : <>
              <Section title="Basic Information">
                <Field label="Location code" value={form.code} onChange={(value) => change("code", value.toUpperCase())} required />
                <Field label="Location name" value={form.name} onChange={(value) => change("name", value)} required />
                <Field label="Location type" value={form.locationType} onChange={(value) => change("locationType", value)} options={typeOptions} required />
                <label className="check tenant-active"><input type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} /> Active</label>
              </Section>
              <Section title="Contact Details">
                <Field label="Contact person" value={form.contactPerson} onChange={(value) => change("contactPerson", value)} />
                <Field label="Email" type="email" value={form.email} onChange={(value) => change("email", value)} />
                <Field label="Phone" value={form.phone} onChange={(value) => change("phone", value)} />
              </Section>
              <Section title="Location Address">
                <Field label="Address line 1" value={form.addressLine1} onChange={(value) => change("addressLine1", value)} />
                <Field label="Address line 2" value={form.addressLine2} onChange={(value) => change("addressLine2", value)} />
                <Field label="City" value={form.city} onChange={(value) => change("city", value)} />
                <Field label="State / Province" value={form.stateProvince} onChange={(value) => change("stateProvince", value)} />
                <Field label="Postal code" value={form.postalCode} onChange={(value) => change("postalCode", value)} />
                <Field label="Country code" value={form.countryCode} onChange={(value) => change("countryCode", value.toUpperCase().slice(0, 2))} placeholder="LK" />
              </Section>
              {Object.values(fieldErrors).filter(Boolean).map((message) => <div className="error-text" key={message}>{message}</div>)}
              {duplicateCode && <div className="error-box">{duplicateCode}</div>}
              {apiError && <div className="error-box">{apiError}</div>}
            </>}
          </div>
          <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={save.isPending || editLoading}>{save.isPending ? "Saving..." : "Save location"}</button></div>
        </form>
      </Modal>
      <LocationView location={viewing} canEdit={permissions.includes("LOCATION_UPDATE")} onClose={() => setViewing(null)} onEdit={(row) => { setViewing(null); startEdit(row); }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="form-section"><h3>{title}</h3><div className="form-grid">{children}</div></section>;
}

function LocationView({ location, canEdit, onClose, onEdit }: { location: Location | null; canEdit: boolean; onClose: () => void; onEdit: (location: Location) => void }) {
  return <Modal open={Boolean(location)} onClose={onClose} title="Location details" subtitle={location?.code} wide>{location && <><div className="modal-body"><div className="tenant-view-head"><div className="tenant-logo-placeholder">{location.name.slice(0, 1)}</div><div><h2>{location.name}</h2><p>{location.locationType.replaceAll("_", " ")}</p><span className={location.isActive ? "status status-on" : "status status-off"}><i /> {location.isActive ? "Active" : "Inactive"}</span></div></div><section className="detail-section"><h3>Contact Details</h3><div className="detail-grid">{[["Contact person", location.contactPerson], ["Email", location.email], ["Phone", location.phone]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}</div></section><section className="detail-section"><h3>Location Address</h3><div className="detail-grid">{[["Address line 1", location.addressLine1], ["Address line 2", location.addressLine2], ["City", location.city], ["State / Province", location.stateProvince], ["Postal code", location.postalCode], ["Country", location.countryCode]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}</div></section></div><div className="modal-foot">{canEdit && <button className="btn btn-primary" onClick={() => onEdit(location)}>Edit</button>}<button className="btn btn-secondary" onClick={onClose}>Close</button></div></>}</Modal>;
}
