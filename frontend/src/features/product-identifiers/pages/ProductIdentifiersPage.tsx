import { CrudPage } from '../../../components/ui/CrudPage';
import { productIdentifiersApi } from '../api/product-identifiersApi';
export function ProductIdentifiersPage(){
  return <CrudPage title="Product Identifiers" subtitle="Barcodes and product identifiers." queryKey="product-identifiers" api={productIdentifiersApi} columns={[{key:'id',label:'ID'},{key:'productId',label:'Product'},{key:'identifierTypeId',label:'Type'},{key:'identifierValue',label:'Value'},{key:'isPrimary',label:'Primary'}]} fields={[{name:'productId',label:'Product ID',type:'number',required:true},{name:'identifierTypeId',label:'Identifier Type ID',type:'number',required:true},{name:'identifierValue',label:'Identifier value',type:'text',required:true}]}/>;
}
