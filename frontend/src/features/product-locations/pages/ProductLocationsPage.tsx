import { CrudPage } from '../../../components/ui/CrudPage';
import { productLocationsApi } from '../api/product-locationsApi';
export function ProductLocationsPage(){
  return <CrudPage title="Product Locations" subtitle="Product availability by location." queryKey="product-locations" api={productLocationsApi} columns={[{key:'id',label:'ID'},{key:'productId',label:'Product'},{key:'locationId',label:'Location'},{key:'isSellable',label:'Sellable'},{key:'isPurchasable',label:'Purchasable'}]} fields={[{name:'productId',label:'Product ID',type:'number',required:true},{name:'locationId',label:'Location ID',type:'number',required:true}]}/>;
}
