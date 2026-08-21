import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaUrl, Tenant, TenantInput, tenantsApi } from '../api/tenantsApi';
import { Modal } from '../../../components/ui/Modal';
import { Field } from '../../../components/ui/Field';

const emptyForm = (): TenantInput => ({
  code: '', name: '', isActive: true, legalName: '', registrationNumber: '', taxRegistrationNumber: '',
  email: '', phone: '', website: '', addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', countryCode: '',
});
const toForm = (tenant: Tenant): TenantInput => ({
  code: tenant.code ?? '', name: tenant.name ?? '', isActive: tenant.isActive,
  legalName: tenant.legalName ?? '', registrationNumber: tenant.registrationNumber ?? '', taxRegistrationNumber: tenant.taxRegistrationNumber ?? '',
  email: tenant.email ?? '', phone: tenant.phone ?? '', website: tenant.website ?? '', addressLine1: tenant.addressLine1 ?? '',
  addressLine2: tenant.addressLine2 ?? '', city: tenant.city ?? '', stateProvince: tenant.stateProvince ?? '', postalCode: tenant.postalCode ?? '', countryCode: tenant.countryCode ?? '',
});

export function TenantsPage() {
  const queryClient = useQueryClient();
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: tenantsApi.list });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [modulesTenant, setModulesTenant] = useState<Tenant | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<TenantInput>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateCode, setDuplicateCode] = useState('');
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [removeLogo, setRemoveLogo] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  const resetModal = () => {
    setForm(emptyForm()); setEditing(null); setFieldErrors({}); setDuplicateCode(''); setApiError('');
    setLogoFile(null); setLogoPreview(''); setRemoveLogo(false); setEditLoading(false); setFileKey((key) => key + 1); save.reset();
  };
  const closeModal = () => { setOpen(false); resetModal(); };
  const openCreate = () => { resetModal(); setSuccess(''); setOpen(true); };
  const openEdit = async (tenant: Tenant) => {
    resetModal(); setSuccess(''); setEditing(tenant); setOpen(true); setEditLoading(true);
    try {
      const current = await tenantsApi.get(tenant.tenantId);
      setEditing(current); setForm(toForm(current)); setLogoPreview(mediaUrl(current.logoUrl)); setApiError('');
    } catch (error) { setApiError(error instanceof Error ? error.message : 'Unable to load tenant.'); }
    finally { setEditLoading(false); }
  };

  const save = useMutation({
    mutationFn: async ({ data, tenantId }: { data: TenantInput; tenantId?: number }) => {
      let saved = tenantId ? await tenantsApi.update(tenantId, data) : (await tenantsApi.create(data)).tenant;
      if (tenantId && removeLogo && !logoFile) saved = await tenantsApi.removeLogo(tenantId);
      if (logoFile) saved = await tenantsApi.uploadLogo(saved.tenantId, logoFile);
      return saved;
    },
    onSuccess: async (_tenant, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setSuccess(variables.tenantId ? 'Tenant updated successfully.' : 'Tenant created successfully.');
      closeModal();
    },
    onError: (error: Error) => {
      const message = error.message || 'Unable to save tenant.';
      if (message.toLowerCase().includes('tenant code already exists')) setDuplicateCode(message);
      else setApiError(message);
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => active ? tenantsApi.activate(id) : tenantsApi.deactivate(id),
    onSuccess: async (tenant) => { await queryClient.invalidateQueries({ queryKey: ['tenants'] }); await queryClient.invalidateQueries({ queryKey: ['tenant-view', tenant.tenantId] }); setSuccess(`Tenant ${tenant.isActive ? 'activated' : 'deactivated'} successfully.`); },
  });

  const rows = useMemo(() => (tenants.data ?? []).filter((row) => `${row.code} ${row.name} ${row.legalName ?? ''}`.toLowerCase().includes(search.toLowerCase())), [tenants.data, search]);
  const change = (key: keyof TenantInput, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: '' })); setApiError('');
    if (key === 'code') { setDuplicateCode(''); save.reset(); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.code.trim()) errors.code = 'Tenant code is required.';
    if (!form.name.trim()) errors.name = 'Tenant name is required.';
    if (form.countryCode && form.countryCode.length !== 2) errors.countryCode = 'Country code must contain 2 letters.';
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setApiError(''); setDuplicateCode(''); save.mutate({ data: { ...form, code: form.code.trim().toUpperCase(), countryCode: form.countryCode?.toUpperCase() }, tenantId: editing?.tenantId });
  };
  const selectLogo = (file?: File) => {
    setApiError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setApiError('Logo must be PNG, JPG, JPEG, or WEBP and no larger than 2MB.'); return; }
    setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); setRemoveLogo(false);
  };

  return <div>
    <div className="page-head"><div><div className="eyebrow">SYSTEM ADMINISTRATION</div><h1>Tenants</h1><p>Manage independent businesses and their ERP environments.</p></div><button className="btn btn-primary" onClick={openCreate}>+ New tenant</button></div>
    {success && <div className="success-box">{success}</div>}
    <div className="stats-row"><div className="stat-card"><span>Total tenants</span><strong>{tenants.data?.length ?? 0}</strong></div><div className="stat-card"><span>Active</span><strong>{(tenants.data ?? []).filter((row) => row.isActive).length}</strong></div><div className="stat-card"><span>Inactive</span><strong>{(tenants.data ?? []).filter((row) => !row.isActive).length}</strong></div></div>
    <div className="card"><div className="toolbar"><div className="search-wrap"><span>⌕</span><input className="input search" placeholder="Search by tenant name or code..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="btn btn-secondary" onClick={() => tenants.refetch()}>↻ Refresh</button></div>
      {tenants.isLoading ? <div className="empty">Loading tenants...</div> : rows.length === 0 ? <div className="empty">No tenants found.</div> : <table className="table"><thead><tr><th>Tenant</th><th>Code</th><th>Status</th><th>Created</th><th className="right">Actions</th></tr></thead><tbody>{rows.map((tenant) => <tr key={tenant.tenantId}><td><div className="primary-cell">{tenant.logoUrl ? <img className="avatar tenant-logo-small" src={mediaUrl(tenant.logoUrl)} alt="" /> : <span className="avatar tenant-avatar">{tenant.name.slice(0, 1).toUpperCase()}</span>}<div><strong>{tenant.name}</strong><small>{tenant.legalName || `Tenant #${tenant.tenantId}`}</small></div></div></td><td><span className="code-chip">{tenant.code}</span></td><td><span className={tenant.isActive ? 'status status-on' : 'status status-off'}><i /> {tenant.isActive ? 'Active' : 'Inactive'}</span></td><td>{tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : '—'}</td><td className="right actions"><button className="btn btn-ghost" onClick={() => setViewingId(tenant.tenantId)}>View</button><button className="btn btn-ghost" onClick={() => openEdit(tenant)}>Edit</button><button className="btn btn-ghost" onClick={() => setModulesTenant(tenant)}>Manage Modules</button><button className={tenant.isActive ? 'btn btn-danger-soft' : 'btn btn-primary'} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: tenant.tenantId, active: !tenant.isActive })}>{tenant.isActive ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table>}
    </div>

    <Modal open={open} onClose={closeModal} title={editing ? 'Edit tenant' : 'Create tenant'} subtitle="Tenant identity, contact, address, and branding." wide><form onSubmit={submit}><div className="modal-body tenant-form-body">{editLoading ? <div className="empty">Loading tenant data...</div> : <>
      <FormSection title="Basic Information"><Field label="Tenant code" value={form.code} onChange={(value) => change('code', value.toUpperCase())} required /><Field label="Tenant name" value={form.name} onChange={(value) => change('name', value)} required /><Field label="Legal name" value={form.legalName} onChange={(value) => change('legalName', value)} /><Field label="Registration number" value={form.registrationNumber} onChange={(value) => change('registrationNumber', value)} /><Field label="Tax registration number" value={form.taxRegistrationNumber} onChange={(value) => change('taxRegistrationNumber', value)} /><label className="check tenant-active"><input type="checkbox" checked={form.isActive} onChange={(event) => change('isActive', event.target.checked)} /> Active</label></FormSection>
      <FormSection title="Contact Details"><Field label="Email" type="email" value={form.email} onChange={(value) => change('email', value)} /><Field label="Phone" value={form.phone} onChange={(value) => change('phone', value)} /><Field label="Website" type="url" value={form.website} onChange={(value) => change('website', value)} full /></FormSection>
      <FormSection title="Head Office Address"><Field label="Address line 1" value={form.addressLine1} onChange={(value) => change('addressLine1', value)} /><Field label="Address line 2" value={form.addressLine2} onChange={(value) => change('addressLine2', value)} /><Field label="City" value={form.city} onChange={(value) => change('city', value)} /><Field label="State / Province" value={form.stateProvince} onChange={(value) => change('stateProvince', value)} /><Field label="Postal code" value={form.postalCode} onChange={(value) => change('postalCode', value)} /><Field label="Country code" value={form.countryCode} onChange={(value) => change('countryCode', value.toUpperCase().slice(0, 2))} placeholder="LK" /></FormSection>
      <FormSection title="Branding"><div className="branding-editor">{logoPreview && !removeLogo ? <img className="tenant-logo-preview" src={logoPreview} alt="Tenant logo preview" /> : <div className="tenant-logo-placeholder">No logo</div>}<div><input key={fileKey} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => selectLogo(event.target.files?.[0])} /><small className="field-hint">PNG, JPG, JPEG or WEBP. Maximum 2MB.</small>{logoPreview && !removeLogo && <button type="button" className="btn btn-danger-soft" onClick={() => { setLogoFile(null); setLogoPreview(''); setRemoveLogo(true); setFileKey((key) => key + 1); }}>Remove logo</button>}</div></div></FormSection>
      {Object.values(fieldErrors).filter(Boolean).map((message) => <div className="error-text" key={message}>{message}</div>)}
      {duplicateCode && <div className="error-box">{duplicateCode}</div>}{apiError && <div className="error-box">{apiError}</div>}
    </>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button><button className="btn btn-primary" disabled={save.isPending || editLoading}>{save.isPending ? 'Saving...' : 'Save tenant'}</button></div></form></Modal>
    <TenantViewModal tenantId={viewingId} onClose={() => setViewingId(null)} onEdit={(tenant) => { setViewingId(null); openEdit(tenant); }} onToggle={(tenant) => statusMutation.mutate({ id: tenant.tenantId, active: !tenant.isActive })} />
    <TenantModulesModal tenant={modulesTenant} onClose={() => setModulesTenant(null)} />
  </div>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="form-section"><h3>{title}</h3><div className="form-grid">{children}</div></section>; }

function TenantViewModal({ tenantId, onClose, onEdit, onToggle }: { tenantId: number | null; onClose: () => void; onEdit: (tenant: Tenant) => void; onToggle: (tenant: Tenant) => void }) {
  const query = useQuery({ queryKey: ['tenant-view', tenantId], queryFn: () => tenantsApi.get(tenantId!), enabled: tenantId !== null });
  const tenant = query.data;
  return <Modal open={tenantId !== null} onClose={onClose} title="Tenant details" subtitle={tenant?.code} wide><div className="modal-body">{query.isLoading ? <div className="empty">Loading tenant...</div> : query.error || !tenant ? <div className="error-box">Unable to load tenant details.</div> : <div className="tenant-view"><div className="tenant-view-head">{tenant.logoUrl ? <img src={mediaUrl(tenant.logoUrl)} alt={`${tenant.name} logo`} /> : <div className="tenant-logo-placeholder">{tenant.name.slice(0, 1)}</div>}<div><h2>{tenant.name}</h2><p>{tenant.legalName || 'No legal name provided'}</p><span className={tenant.isActive ? 'status status-on' : 'status status-off'}><i /> {tenant.isActive ? 'Active' : 'Inactive'}</span></div></div><DetailSection title="Company" values={[['Registration', tenant.registrationNumber], ['Tax registration', tenant.taxRegistrationNumber], ['Email', tenant.email], ['Phone', tenant.phone], ['Website', tenant.website]]} /><DetailSection title="Head Office Address" values={[['Address line 1', tenant.addressLine1], ['Address line 2', tenant.addressLine2], ['City', tenant.city], ['State / Province', tenant.stateProvince], ['Postal code', tenant.postalCode], ['Country', tenant.countryCode]]} /><section className="detail-section"><h3>Locations ({tenant.locations?.length ?? 0})</h3>{tenant.locations?.length ? <table className="table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Address</th><th>Status</th></tr></thead><tbody>{tenant.locations.map((location) => <tr key={location.locationId}><td>{location.code}</td><td>{location.name}</td><td>{location.locationType.replaceAll('_', ' ')}</td><td>{[location.addressLine1, location.city, location.countryCode].filter(Boolean).join(', ') || '—'}</td><td>{location.isActive ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table> : <div className="empty">No locations created.</div>}</section></div>}</div>{tenant && <div className="modal-foot"><button className={tenant.isActive ? 'btn btn-danger-soft' : 'btn btn-primary'} onClick={() => onToggle(tenant)}>{tenant.isActive ? 'Deactivate' : 'Activate'}</button><button className="btn btn-primary" onClick={() => onEdit(tenant)}>Edit</button><button className="btn btn-secondary" onClick={onClose}>Close</button></div>}</Modal>;
}
function DetailSection({ title, values }: { title: string; values: [string, unknown][] }) { return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{values.map(([label, value]) => <div key={label}><small>{label}</small><strong>{String(value || '—')}</strong></div>)}</div></section>; }

function TenantModulesModal({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const queryClient = useQueryClient(); const tenantId = tenant?.tenantId ?? 0;
  const modules = useQuery({ queryKey: ['tenant-modules', tenantId], queryFn: () => tenantsApi.listModules(tenantId), enabled: Boolean(tenant) });
  const update = useMutation({ mutationFn: ({ moduleId, isEnabled }: { moduleId: number; isEnabled: boolean }) => tenantsApi.setModuleEnabled(tenantId, moduleId, isEnabled), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-modules', tenantId] }) });
  return <Modal open={Boolean(tenant)} onClose={onClose} title="Manage Modules" subtitle={tenant ? `Tenant: ${tenant.code} · ${tenant.name}` : undefined} wide><div className="modal-body"><div className="context-banner"><span>•</span><div><strong>Platform-controlled modules</strong><small>Disabled modules disappear for tenant users and are blocked by backend authorization.</small></div></div><div className="card" style={{ marginTop: 12 }}>{modules.isLoading ? <div className="empty">Loading modules...</div> : (modules.data ?? []).map((module) => <div key={module.moduleId} className="module-row"><div><strong>{module.name}</strong><small>{module.code}</small></div><label className="check"><input type="checkbox" checked={module.isEnabled} disabled={update.isPending} onChange={(event) => update.mutate({ moduleId: Number(module.moduleId), isEnabled: event.target.checked })} /> {module.isEnabled ? 'Enabled' : 'Disabled'}</label></div>)}</div>{update.error && <div className="error-box">{(update.error as Error).message}</div>}</div><div className="modal-foot"><button className="btn btn-secondary" onClick={onClose}>Close</button></div></Modal>;
}
