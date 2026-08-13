import { CrudPage } from '../../../components/ui/CrudPage';
import { priceListItemsApi } from '../api/price-list-itemsApi';
export function PriceListItemsPage(){
  return <CrudPage title="Price List Items" subtitle="Product selling prices and quantity tiers." queryKey="price-list-items" api={priceListItemsApi} columns={[{key:'id',label:'ID'},{key:'priceListId',label:'Price List'},{key:'productId',label:'Product'},{key:'unitId',label:'Unit'},{key:'sellingPrice',label:'Price'},{key:'minimumQuantity',label:'Min Qty'}]} fields={[{name:'priceListId',label:'Price List ID',type:'number',required:true},{name:'productId',label:'Product ID',type:'number',required:true},{name:'unitId',label:'Unit ID',type:'number',required:true},{name:'sellingPrice',label:'Selling price',type:'number',required:true},{name:'minimumQuantity',label:'Minimum quantity',type:'number',required:true},{name:'effectiveFrom',label:'Effective from',type:'datetime-local',required:true}]}/>;
}
