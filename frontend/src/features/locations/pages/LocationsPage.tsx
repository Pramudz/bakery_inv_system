import { CrudPage } from '../../../components/ui/CrudPage';
import { locationsApi } from '../api/locationsApi';
export function LocationsPage(){
  return <CrudPage title="Locations" subtitle="Stores, warehouses and distribution centers." queryKey="locations" api={locationsApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'locationType',label:'Type'},{key:'isActive',label:'Status'}]} fields={[{name:'tenantId',label:'Tenant ID',type:'number',required:true},{name:'code',label:'Code',type:'text',required:true},{name:'name',label:'Name',type:'text',required:true},{name:'locationType',label:'Type',type:'text',required:true}]}/>;
}
