import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '../api/rolesApi';
import { modulesApi } from '../../modules/api/modulesApi';
import { permissionsApi } from '../../permissions/api/permissionsApi';
import { rolePermissionsApi } from '../../role-permissions/api/role-permissionsApi';
import { Modal } from '../../../components/ui/Modal';
import { Field } from '../../../components/ui/Field';

const roleIdOf = (role: any) => Number(role.roleId ?? role.id);
const permissionIdOf = (permission: any) => Number(permission.permissionId ?? permission.id);
const moduleIdOf = (module: any) => Number(module.moduleId ?? module.id);
const emptyForm = () => ({ code: '', name: '', accessScope: 'TENANT', isActive: true });

export function RolesPage() {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const modules = useQuery({ queryKey: ['modules'], queryFn: modulesApi.list });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: permissionsApi.list });
  const assignments = useQuery({ queryKey: ['role-permissions'], queryFn: rolePermissionsApi.list });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState('');

  const enabledModules = modules.data ?? [];
  const groupedPermissions = useMemo(() => enabledModules.map((module: any) => ({
    module,
    permissions: (permissions.data ?? []).filter((permission: any) => Number(permission.moduleId) === moduleIdOf(module)),
  })).filter(group => group.permissions.length > 0), [enabledModules, permissions.data]);

  const save = useMutation({
    mutationFn: async () => {
      setError('');
      const payload = { code: form.code, name: form.name, accessScope: editing?.code === 'TENANT_ADMIN' ? 'TENANT' : form.accessScope };
      const role: any = editing ? await rolesApi.update(roleIdOf(editing), payload) : await rolesApi.create(payload);
      const roleId = roleIdOf(role);
      const assigned = new Set((assignments.data ?? []).filter((item: any) => Number(item.roleId) === roleId).map((item: any) => Number(item.permissionId)));
      for (const permissionId of selected.filter(permissionId => !assigned.has(permissionId))) {
        await rolePermissionsApi.create({ roleId, permissionId, assignedAt: new Date().toISOString() });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['role-permissions'] }),
      ]);
      setOpen(false);
      setEditing(null);
    },
    onError: (reason: Error) => setError(reason.message),
  });

  const startCreate = () => { setEditing(null); setForm(emptyForm()); setSelected([]); setError(''); setOpen(true); };
  const startEdit = (role: any) => {
    setEditing(role);
    setForm({ code: role.code ?? '', name: role.name ?? '', accessScope: role.accessScope ?? 'TENANT', isActive: role.isActive !== false });
    setSelected((assignments.data ?? []).filter((item: any) => Number(item.roleId) === roleIdOf(role)).map((item: any) => Number(item.permissionId)));
    setError(''); setOpen(true);
  };
  const togglePermission = (permissionId: number, checked: boolean) => setSelected(current => checked ? [...new Set([...current, permissionId])] : current.filter(id => id !== permissionId));
  const permissionLabel = (permission: any) => (permission.name ?? permission.code ?? '').replace(/_/g, ' ');

  return <div>
    <div className="page-head"><div><div className="eyebrow">ACCESS MANAGEMENT</div><h1>Roles</h1><p>Tenant roles and access profiles.</p></div><button className="btn btn-primary" onClick={startCreate}>＋ New role</button></div>
    <div className="card"><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Access Scope</th><th>System Role</th><th>Status</th><th className="right">Actions</th></tr></thead><tbody>
      {roles.isLoading ? <tr><td colSpan={6}>Loading...</td></tr> : (roles.data ?? []).map((role: any) => <tr key={roleIdOf(role)}><td><span className="code-chip">{role.code}</span></td><td>{role.name}</td><td>{role.accessScope === 'LOCATION' ? 'Location-based' : 'Tenant-wide'}</td><td>{role.isSystemRole ? 'Yes' : 'No'}</td><td><span className={role.isActive !== false ? 'status status-on' : 'status status-off'}><i /> {role.isActive !== false ? 'Active' : 'Inactive'}</span></td><td className="right"><button className="btn btn-ghost" onClick={() => startEdit(role)}>Edit</button>{role.isActive !== false && <button className="btn btn-danger-soft" onClick={() => rolesApi.deactivate(roleIdOf(role)).then(() => queryClient.invalidateQueries({ queryKey: ['roles'] }))}>Deactivate</button>}</td></tr>)}
    </tbody></table></div>
    <Modal open={open} onClose={() => !save.isPending && setOpen(false)} title={editing ? 'Edit role' : 'Create role'} subtitle="Permissions are available only from modules enabled for this tenant." wide>
      <form onSubmit={event => { event.preventDefault(); save.mutate(); }}><div className="modal-body"><div className="form-grid">
        <Field label="Code" value={form.code} onChange={code => setForm({ ...form, code })} required disabled={editing?.isSystemRole}/>
        <Field label="Name" value={form.name} onChange={name => setForm({ ...form, name })} required/>
        <Field label="Access Scope" value={form.accessScope} onChange={accessScope => setForm({ ...form, accessScope })} required disabled={editing?.code === 'TENANT_ADMIN'} options={[{ value: 'TENANT', label: 'Tenant-wide' }, { value: 'LOCATION', label: 'Location-based' }]}/>
        <div className="field"><label>Status</label><label className="check"><input type="checkbox" checked={form.isActive} disabled /> {form.isActive ? 'Active' : 'Inactive'}</label></div>
      </div>{editing?.code === 'TENANT_ADMIN' && <div className="context-banner"><span>•</span><div><strong>Protected system role</strong><small>TENANT_ADMIN always has tenant-wide access. Enabled-module permissions are granted automatically by the backend.</small></div></div>}
      <div style={{ marginTop: 20 }}><h3>Permissions</h3><p className="section-desc">Choose actions for this role, grouped by enabled module.</p></div>
      {groupedPermissions.map(({ module, permissions: modulePermissions }) => <div className="card" key={moduleIdOf(module)} style={{ marginTop: 12, padding: 16 }}><strong>{module.name ?? module.code}</strong><div className="check-grid" style={{ marginTop: 10 }}>{modulePermissions.map((permission: any) => <label className="check" key={permissionIdOf(permission)}><input type="checkbox" checked={selected.includes(permissionIdOf(permission))} disabled={editing?.code === 'TENANT_ADMIN'} onChange={event => togglePermission(permissionIdOf(permission), event.target.checked)} /> {permissionLabel(permission)}</label>)}</div></div>)}
      {error && <div className="error-box">{error}</div>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save role'}</button></div></form>
    </Modal>
  </div>;
}
