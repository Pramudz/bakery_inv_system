import { CrudPage } from '../../../components/ui/CrudPage';
import { priceListsApi } from '../api/price-listsApi';
export function PriceListsPage(){
  return <CrudPage title="Price Lists" subtitle="Selling price list headers." queryKey="price-lists" api={priceListsApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'code',label:'Code'},{key:'name',label:'Name'},{key:'priceListType',label:'Type'},{key:'currencyCode',label:'Currency'},{key:'isActive',label:'Status'}]} fields={[{name:'code',label:'Code',type:'text',required:true},{name:'name',label:'Name',type:'text',required:true},{name:'priceListType',label:'Type',type:'text',required:true},{name:'currencyCode',label:'Currency',type:'text',required:false}]}/>;
}
