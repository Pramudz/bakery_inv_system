import { CrudPage } from '../../../components/ui/CrudPage';
import { brandsApi } from '../api/brandsApi';
export function BrandsPage(){
  return <CrudPage title="Brands" subtitle="Product brands." queryKey="brands" api={brandsApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'brandCode',label:'Code'},{key:'brandName',label:'Name'},{key:'isActive',label:'Status'}]} fields={[{name:'tenantId',label:'Tenant ID',type:'number',required:true},{name:'brandCode',label:'Code',type:'text',required:true},{name:'brandName',label:'Name',type:'text',required:true},{name:'description',label:'Description',type:'text',required:false}]}/>;
}
