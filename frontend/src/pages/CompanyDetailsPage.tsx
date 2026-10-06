import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field } from "../components/ui/Field";
import { useAuth } from "../features/auth/AuthContext";
import { mediaUrl } from "../features/tenants/api/tenantsApi";
import { tenantProfileApi } from "../features/tenants/api/tenantProfileApi";
import type { TenantProfileInput } from "../features/tenants/api/tenantProfileApi";

type CompanyForm = Pick<
  TenantProfileInput,
  | "name"
  | "registrationNumber"
  | "businessCategory"
  | "taxRegistrationNumber"
  | "email"
  | "phone"
  | "website"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "stateProvince"
  | "postalCode"
  | "countryCode"
>;

export function CompanyDetailsPage() {
  const queryClient = useQueryClient();
  const { role, permissions } = useAuth();
  const profile = useQuery({ queryKey: ["tenant-profile"], queryFn: tenantProfileApi.get });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canEdit = role?.code === "TENANT_ADMIN" || permissions.includes("TENANT_PROFILE_UPDATE");

  const save = useMutation({
    mutationFn: async (input: CompanyForm) => {
      let tenant = await tenantProfileApi.update(input);
      if (removeLogo && !logoFile) tenant = await tenantProfileApi.removeLogo();
      if (logoFile) tenant = await tenantProfileApi.uploadLogo(logoFile);
      return tenant;
    },
    onSuccess: async (tenant) => {
      queryClient.setQueryData(["tenant-profile"], tenant);
      await queryClient.invalidateQueries({ queryKey: ["tenant-profile"] });
      setEditing(false);
      setForm(null);
      setLogoFile(null);
      setLogoPreview("");
      setRemoveLogo(false);
      setFileInputKey((key) => key + 1);
      setError("");
      setSuccess("Company details saved.");
    },
    onError: (cause: Error) => setError(cause.message || "Unable to save company details."),
  });

  const startEditing = () => {
    if (!profile.data) return;
    setForm({
      name: profile.data.name ?? "",
      registrationNumber: profile.data.registrationNumber ?? "",
      businessCategory: profile.data.businessCategory ?? "",
      taxRegistrationNumber: profile.data.taxRegistrationNumber ?? "",
      email: profile.data.email ?? "",
      phone: profile.data.phone ?? "",
      website: profile.data.website ?? "",
      addressLine1: profile.data.addressLine1 ?? "",
      addressLine2: profile.data.addressLine2 ?? "",
      city: profile.data.city ?? "",
      stateProvince: profile.data.stateProvince ?? "",
      postalCode: profile.data.postalCode ?? "",
      countryCode: profile.data.countryCode ?? "",
    });
    setLogoFile(null);
    setLogoPreview(mediaUrl(profile.data.logoUrl));
    setRemoveLogo(false);
    setFileInputKey((key) => key + 1);
    setError("");
    setSuccess("");
    setEditing(true);
  };

  const cancelEditing = () => {
    if (logoFile && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    setEditing(false);
    setForm(null);
    setLogoFile(null);
    setLogoPreview("");
    setRemoveLogo(false);
    setFileInputKey((key) => key + 1);
    setError("");
  };

  const change = (key: keyof CompanyForm, value: string) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setError("");
  };

  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Logo must be PNG, JPG, JPEG, or WEBP and no larger than 2MB.");
      event.target.value = "";
      return;
    }
    if (logoFile && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
    setError("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!form.phone?.trim()) {
      setError("Phone is required.");
      return;
    }
    if (!form.addressLine1?.trim()) {
      setError("Company address is required. Enter Address line 1.");
      return;
    }
    if (!form.city?.trim()) {
      setError("City is required.");
      return;
    }
    save.mutate({
      ...form,
      name: form.name.trim(),
      registrationNumber: form.registrationNumber?.trim() || null,
      businessCategory: form.businessCategory?.trim() || null,
      taxRegistrationNumber: form.taxRegistrationNumber?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      website: form.website?.trim() || null,
      addressLine1: form.addressLine1?.trim() || null,
      addressLine2: form.addressLine2?.trim() || null,
      city: form.city?.trim() || null,
      stateProvince: form.stateProvince?.trim() || null,
      postalCode: form.postalCode?.trim() || null,
      countryCode: form.countryCode?.trim().toUpperCase() || null,
    });
  };

  if (profile.isLoading) return <div className="empty">Loading company details...</div>;
  if (profile.error) return <div className="error-box">{profile.error instanceof Error ? profile.error.message : "Unable to load company details."}</div>;
  if (!profile.data) return <div className="empty">Company details are not available.</div>;

  const company = profile.data;
  const companyAddress = [
    company.addressLine1,
    company.addressLine2,
    company.city,
    company.stateProvince,
    company.postalCode,
    company.countryCode,
  ].filter(Boolean).join(", ");
  const currentLogo = editing ? (removeLogo ? "" : logoPreview) : mediaUrl(company.logoUrl);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">ORGANIZATION</div>
          <h1>Company Details</h1>
          <p>Set your company name and optional business details.</p>
        </div>
        {canEdit && !editing && <button className="btn btn-primary" type="button" onClick={startEditing}>Edit company details</button>}
      </div>

      {success && <div className="success-box">{success}</div>}

      <div className="card company-details-card">
        <div className="company-details-heading">
          {currentLogo
            ? <img className="company-details-logo" src={currentLogo} alt={`${company.name} logo`} />
            : <div className="tenant-logo-placeholder">{(form?.name || company.name).slice(0, 1).toUpperCase()}</div>}
          <div>
            <h2>{editing ? form?.name || company.name : company.name}</h2>
            {(editing ? form?.businessCategory : company.businessCategory) && <p>{editing ? form?.businessCategory : company.businessCategory}</p>}
          </div>
        </div>

        {editing && form ? (
          <form onSubmit={submit}>
            <div className="company-details-fields">
              <Field label="Company name" value={form.name} onChange={(value) => change("name", value)} required />
              <Field label="Registration number (Optional)" value={form.registrationNumber} onChange={(value) => change("registrationNumber", value)} />
              <Field label="Business category (Optional)" value={form.businessCategory} onChange={(value) => change("businessCategory", value)} />
              <Field label="Tax registration number (Optional)" value={form.taxRegistrationNumber} onChange={(value) => change("taxRegistrationNumber", value)} />
              <Field label="Email (Optional)" type="email" value={form.email} onChange={(value) => change("email", value)} />
              <Field label="Phone" value={form.phone} onChange={(value) => change("phone", value)} required />
              <Field label="Website (Optional)" type="url" value={form.website} onChange={(value) => change("website", value)} />
              <label className="company-logo-field">
                <span>Company logo (Optional)</span>
                <input
                  key={fileInputKey}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={selectLogo}
                />
                <small>PNG, JPG, or WEBP. Maximum 2MB.</small>
              </label>
            </div>

            <section className="company-address-section">
              <h3>Company Address (Optional)</h3>
              <div className="company-details-fields">
                <Field label="Address line 1" value={form.addressLine1} onChange={(value) => change("addressLine1", value)} required />
                <Field label="Address line 2" value={form.addressLine2} onChange={(value) => change("addressLine2", value)} />
                <Field label="City" value={form.city} onChange={(value) => change("city", value)} required />
                <Field label="State / Province" value={form.stateProvince} onChange={(value) => change("stateProvince", value)} />
                <Field label="Postal code" value={form.postalCode} onChange={(value) => change("postalCode", value)} />
                <Field label="Country code" value={form.countryCode} onChange={(value) => change("countryCode", value.slice(0, 2))} placeholder="LK" />
              </div>
            </section>

            {(logoFile || (company.logoUrl && !removeLogo)) && (
              <button className="btn btn-danger-soft company-remove-logo" type="button" onClick={() => {
                if (logoFile) {
                  if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
                  setLogoFile(null);
                  setLogoPreview(mediaUrl(company.logoUrl));
                  setRemoveLogo(false);
                } else {
                  setLogoPreview("");
                  setRemoveLogo(true);
                }
                setFileInputKey((key) => key + 1);
              }}>{logoFile ? "Remove selected logo" : "Remove current logo"}</button>
            )}
            {error && <div className="error-box">{error}</div>}
            <div className="company-details-actions">
              <button className="btn btn-secondary" type="button" disabled={save.isPending} onClick={cancelEditing}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save company details"}</button>
            </div>
          </form>
        ) : (
          <div className="company-details-values">
            <CompanyValue label="Registration number" value={company.registrationNumber} />
            <CompanyValue label="Business category" value={company.businessCategory} />
            <CompanyValue label="Tax registration number" value={company.taxRegistrationNumber} />
            <CompanyValue label="Email" value={company.email} />
            <CompanyValue label="Phone" value={company.phone} />
            <CompanyValue label="Website" value={company.website} />
            <CompanyValue label="Company address" value={companyAddress} />
          </div>
        )}
      </div>
      {!editing && profile.isRefetchError && <div className="error-box">Could not refresh company details. Showing the last loaded values.</div>}
    </div>
  );
}

function CompanyValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}
