import { CrudPage } from '../../../components/ui/CrudPage';
import { rolePermissionsApi } from '../api/role-permissionsApi';
export function RolePermissionsPage(){
  return <CrudPage title="Role Permissions" subtitle="Assign permissions to roles." queryKey="role-permissions" api={rolePermissionsApi} columns={[{key:'id',label:'ID'},{key:'roleId',label:'Role'},{key:'permissionId',label:'Permission'},{key:'assignedAt',label:'Assigned'}]} fields={[{name:'roleId',label:'Role ID',type:'number',required:true},{name:'permissionId',label:'Permission ID',type:'number',required:true},{name:'assignedAt',label:'Assigned at',type:'datetime-local',required:true}]}/>;
}
