import { CrudPage } from '../../../components/ui/CrudPage';
import { userRolesApi } from '../api/user-rolesApi';
export function UserRolesPage(){
  return <CrudPage title="User Roles" subtitle="Assign roles to users." queryKey="user-roles" api={userRolesApi} columns={[{key:'id',label:'ID'},{key:'userId',label:'User'},{key:'roleId',label:'Role'},{key:'assignedAt',label:'Assigned'}]} fields={[{name:'userId',label:'User ID',type:'number',required:true},{name:'roleId',label:'Role ID',type:'number',required:true},{name:'assignedAt',label:'Assigned at',type:'datetime-local',required:true}]}/>;
}
