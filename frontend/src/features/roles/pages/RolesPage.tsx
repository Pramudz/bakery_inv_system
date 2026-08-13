import { CrudPage } from '../../../components/ui/CrudPage';
import { rolesApi } from '../api/rolesApi';
export function RolesPage() {
  return <CrudPage title="Roles" subtitle="Tenant roles and access profiles." queryKey="roles" api={rolesApi} columns={[{ key: 'id', label: 'ID' }, { key: 'tenantId', label: 'Tenant' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'isSystemRole', label: 'System' }, { key: 'isActive', label: 'Status' }]} fields={[{ name: 'code', label: 'Code', type: 'text', required: true }, { name: 'name', label: 'Name', type: 'text', required: true }, { name: 'description', label: 'Description', type: 'text', required: false }]} />;
}
