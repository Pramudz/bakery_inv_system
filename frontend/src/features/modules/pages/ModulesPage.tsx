import { CrudPage } from '../../../components/ui/CrudPage';
import { platformModulesApi } from '../api/modulesApi';
export function ModulesPage(){
  return <CrudPage title="Modules" subtitle="Global application modules." queryKey="platform-modules" api={platformModulesApi} columns={[{key:'id',label:'ID'},{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'displayOrder',label:'Order'},{key:'isActive',label:'Status'}]} fields={[{name:'code',label:'Code',type:'text',required:true},{name:'name',label:'Name',type:'text',required:true},{name:'description',label:'Description',type:'text',required:false},{name:'displayOrder',label:'Display order',type:'number',required:false}]}/>;
}
