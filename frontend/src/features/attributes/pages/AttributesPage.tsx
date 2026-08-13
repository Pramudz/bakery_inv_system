import { CrudPage } from '../../../components/ui/CrudPage';
import { attributesApi } from '../api/attributesApi';
export function AttributesPage(){
  return <CrudPage title="Attributes" subtitle="Configurable product attributes." queryKey="attributes" api={attributesApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'dataType',label:'Data Type'},{key:'isActive',label:'Status'}]} fields={[{name:'code',label:'Code',type:'text',required:true},{name:'name',label:'Name',type:'text',required:true},{name:'dataType',label:'Data type',type:'text',required:true}]}/>;
}
