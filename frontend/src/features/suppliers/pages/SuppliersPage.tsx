import { CrudPage } from '../../../components/ui/CrudPage';
import { suppliersApi } from '../api/suppliersApi';
export function SuppliersPage(){
  return <CrudPage title="Suppliers" subtitle="Supplier master." queryKey="suppliers" api={suppliersApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'supplierCode',label:'Code'},{key:'supplierName',label:'Name'},{key:'phone',label:'Phone'},{key:'isActive',label:'Status'}]} fields={[{name:'tenantId',label:'Tenant ID',type:'number',required:true},{name:'supplierCode',label:'Code',type:'text',required:true},{name:'supplierName',label:'Name',type:'text',required:true},{name:'contactName',label:'Contact',type:'text',required:false},{name:'phone',label:'Phone',type:'text',required:false},{name:'email',label:'Email',type:'email',required:false},{name:'city',label:'City',type:'text',required:false}]}/>;
}
