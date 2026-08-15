import { CrudPage } from '../../../components/ui/CrudPage';
import { customersApi } from '../api/customersApi';

export function CustomersPage(){
  return <CrudPage title="Customers" subtitle="Customer master data. The ID is generated automatically after saving." queryKey="customers" api={customersApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'customerCode',label:'Code'},{key:'customerName',label:'Name'},{key:'phone',label:'Phone'},{key:'city',label:'City'},{key:'isActive',label:'Status'}]} fields={[{name:'id',label:'Customer ID',type:'text',readOnly:true,placeholder:'Auto-generated after save'},{name:'customerCode',label:'Code',type:'text',required:true},{name:'customerName',label:'Name',type:'text',required:true},{name:'contactName',label:'Contact',type:'text',required:false},{name:'phone',label:'Phone',type:'text',required:false},{name:'email',label:'Email',type:'email',required:false},{name:'addressLine1',label:'Address Line 1',type:'text',required:false},{name:'addressLine2',label:'Address Line 2',type:'text',required:false},{name:'city',label:'City',type:'text',required:false}]}/>;
}
