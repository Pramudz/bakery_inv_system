import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../auth/AuthContext';
import { mediaUrl } from '../api/tenantsApi';
import { TenantProfile, TenantProfileInput, tenantProfileApi } from '../api/tenantProfileApi';

const emptyForm = (): TenantProfileInput => ({ name: '', legalName: '', registrationNumber: '', taxRegistrationNumber: '', email: '', phone: '', website: '', addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', countryCode: '' });
const profileForm = (tenant: TenantProfile): TenantProfileInput => ({ name: tenant.name, legalName: tenant.legalName ?? '', registrationNumber: tenant.registrationNumber ?? '', taxRegistrationNumber: tenant.taxRegistrationNumber ?? '', email: tenant.email ?? '', phone: tenant.phone ?? '', website: tenant.website ?? '', addressLine1: tenant.addressLine1 ?? '', addressLine2: tenant.addressLine2 ?? '', city: tenant.city ?? '', stateProvince: tenant.stateProvince ?? '', postalCode: tenant.postalCode ?? '', countryCode: tenant.countryCode ?? '' });

export function TenantProfilePage() {
  const queryClient = useQueryClient();
  const { permissions, role } = useAuth();
  const query = useQuery({ queryKey: ['tenant-profile'], queryFn: tenantProfileApi.get });
  const [open, setOpen] = useState(false); const [form, setForm] = useState<TenantProfileInput>(emptyForm); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const [apiError, setApiError] = useState(''); const [success, setSuccess] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null); const [logoPreview, setLogoPreview] = useState(''); const [removeLogo, setRemoveLogo] = useState(false); const [fileKey, setFileKey] = useState(0);
  const canEdit = role?.code === 'TENANT_ADMIN' || permissions.includes('TENANT_PROFILE_UPDATE');

  const resetModal = () => { if (logoFile && logoPreview) URL.revokeObjectURL(logoPreview); setForm(emptyForm()); setFieldErrors({}); setApiError(''); setLogoFile(null); setLogoPreview(''); setRemoveLogo(false); setFileKey((key) => key + 1); update.reset(); };
  const closeModal = () => { setOpen(false); resetModal(); };
  const openModal = () => { if (!query.data) return; resetModal(); setSuccess(''); setForm(profileForm(query.data)); setLogoPreview(mediaUrl(query.data.logoUrl)); setOpen(true); };
  const update = useMutation({
    mutationFn: async (data: TenantProfileInput) => {
      let tenant = await tenantProfileApi.update(data);
      if (removeLogo && !logoFile) tenant = await tenantProfileApi.removeLogo();
      if (logoFile) tenant = await tenantProfileApi.uploadLogo(logoFile);
      return tenant;
    },
    onSuccess: async (tenant) => { queryClient.setQueryData(['tenant-profile'], tenant); await queryClient.invalidateQueries({ queryKey: ['tenant-profile'] }); setSuccess('Tenant profile updated successfully.'); closeModal(); },
    onError: (error: Error) => setApiError(error.message || 'Unable to update tenant profile.'),
  });
  const change = (key: keyof TenantProfileInput, value: string) => { setForm((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: '' })); setApiError(''); };
  const submit = (event: FormEvent) => { event.preventDefault(); const errors: Record<string, string> = {}; if (!form.name.trim()) errors.name = 'Trading name is required.'; if (form.countryCode && form.countryCode.length !== 2) errors.countryCode = 'Country must be a two-letter code.'; if (Object.keys(errors).length) { setFieldErrors(errors); return; } setFieldErrors({}); setApiError(''); update.mutate({ ...form, name: form.name.trim(), countryCode: form.countryCode?.toUpperCase() }); };
  const selectLogo = (file?: File) => { setApiError(''); if (!file) return; if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setApiError('Logo must be PNG, JPG, JPEG, or WEBP and no larger than 2MB.'); return; } if (logoFile && logoPreview) URL.revokeObjectURL(logoPreview); setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); setRemoveLogo(false); };

  if (query.isLoading) return <div className="empty">Loading tenant details...</div>;
  if (query.error) return <div className="empty error-text">Unable to load your tenant details.</div>;
  const tenant = query.data;
  if (!tenant) return <div className="empty">Tenant details not found.</div>;

  return <div><div className="page-head"><div><div className="eyebrow">MY ORGANIZATION</div><h1>{tenant.name}</h1><p>Details for the business associated with your login.</p></div><span className={tenant.isActive ? 'status status-on' : 'status status-off'}><i /> {tenant.isActive ? 'Active' : 'Inactive'}</span></div>
    {success && <div className="success-box">{success}</div>}
    <div className="card tenant-profile-card"><div className="tenant-profile-card-actions">{canEdit && <button className="btn btn-primary" onClick={openModal}>Edit Tenant Profile</button>}</div><div className="tenant-view-head">{tenant.logoUrl ? <img src={mediaUrl(tenant.logoUrl)} alt={`${tenant.name} logo`} /> : <div className="tenant-logo-placeholder">{tenant.name.slice(0, 1)}</div>}<div><h2>{tenant.legalName || tenant.name}</h2><p>{tenant.code} · Tenant #{tenant.tenantId}</p></div></div>
      <ProfileSection title="Company Details" rows={[['Trading name', tenant.name], ['Legal name', tenant.legalName], ['Registration number', tenant.registrationNumber], ['Tax registration number', tenant.taxRegistrationNumber]]} />
      <ProfileSection title="Contact Details" rows={[['Email', tenant.email], ['Phone', tenant.phone], ['Website', tenant.website]]} />
      <ProfileSection title="Head Office Address" rows={[['Address line 1', tenant.addressLine1], ['Address line 2', tenant.addressLine2], ['City', tenant.city], ['State / Province', tenant.stateProvince], ['Postal code', tenant.postalCode], ['Country', tenant.countryCode]]} />
    </div>
    <Modal open={open} onClose={closeModal} title="Edit Tenant Profile" subtitle="Update your organization details and branding." wide><form onSubmit={submit}><div className="modal-body tenant-form-body">
      <section className="form-section"><h3>Basic Information</h3><div className="form-grid"><Field label="Tenant code" value={tenant.code} onChange={() => undefined} disabled hint="Tenant code can only be changed by a platform administrator." /><Field label="Trading name / Tenant name" value={form.name} onChange={(value) => change('name', value)} required /><Field label="Legal name" value={form.legalName} onChange={(value) => change('legalName', value)} /><Field label="Registration number" value={form.registrationNumber} onChange={(value) => change('registrationNumber', value)} /><Field label="Tax registration number" value={form.taxRegistrationNumber} onChange={(value) => change('taxRegistrationNumber', value)} /></div></section>
      <section className="form-section"><h3>Contact Details</h3><div className="form-grid"><Field label="Email" type="email" value={form.email} onChange={(value) => change('email', value)} /><Field label="Phone" value={form.phone} onChange={(value) => change('phone', value)} /><Field label="Website" type="url" value={form.website} onChange={(value) => change('website', value)} full /></div></section>
      <section className="form-section"><h3>Head Office Address</h3><div className="form-grid"><Field label="Address line 1" value={form.addressLine1} onChange={(value) => change('addressLine1', value)} /><Field label="Address line 2" value={form.addressLine2} onChange={(value) => change('addressLine2', value)} /><Field label="City" value={form.city} onChange={(value) => change('city', value)} /><Field label="State / Province" value={form.stateProvince} onChange={(value) => change('stateProvince', value)} /><Field label="Postal code" value={form.postalCode} onChange={(value) => change('postalCode', value)} /><Field label="Country" value={form.countryCode} onChange={(value) => change('countryCode', value.toUpperCase().slice(0, 2))} placeholder="LK" /></div></section>
      <section className="form-section"><h3>Tenant Logo</h3><div className="branding-editor">{logoPreview && !removeLogo ? <img className="tenant-logo-preview" src={logoPreview} alt="Tenant logo preview" /> : <div className="tenant-logo-placeholder">No logo</div>}<div><input key={fileKey} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => selectLogo(event.target.files?.[0])} /><small className="field-hint">PNG, JPG, JPEG or WEBP. Maximum 2MB.</small>{logoPreview && !removeLogo && <button type="button" className="btn btn-danger-soft" onClick={() => { if (logoFile) URL.revokeObjectURL(logoPreview); setLogoFile(null); setLogoPreview(''); setRemoveLogo(true); setFileKey((key) => key + 1); }}>Remove logo</button>}</div></div></section>
      {Object.values(fieldErrors).filter(Boolean).map((message) => <div className="error-text" key={message}>{message}</div>)}{apiError && <div className="error-box">{apiError}</div>}
    </div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button><button className="btn btn-primary" disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save changes'}</button></div></form></Modal>
  </div>;
}

function ProfileSection({ title, rows }: { title: string; rows: [string, unknown][] }) { return <section className="detail-section"><h3>{title}</h3><div className="detail-grid">{rows.map(([label, value]) => <div key={label}><small>{label}</small><strong>{String(value || '—')}</strong></div>)}</div></section>; }
