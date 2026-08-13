import { CrudPage } from '../../../components/ui/CrudPage';
import { permissionsApi } from '../api/permissionsApi';
export function PermissionsPage(){
  return <CrudPage title="Permissions" subtitle="Fine-grained application permissions." queryKey="permissions" api={permissionsApi} columns={[{key:'id',label:'ID'},{key:'moduleId',label:'Module'},{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'isActive',label:'Status'}]} fields={[{name:'moduleId',label:'Module ID',type:'number',required:true},{name:'code',label:'Code',type:'text',required:true},{name:'name',label:'Name',type:'text',required:true},{name:'description',label:'Description',type:'text',required:false}]}/>;
}
