import { CrudPage } from '../../../components/ui/CrudPage';
import { productAttributesApi } from '../api/product-attributesApi';
export function ProductAttributesPage(){
  return <CrudPage title="Product Attributes" subtitle="Assign values to product attributes." queryKey="product-attributes" api={productAttributesApi} columns={[{key:'id',label:'ID'},{key:'productId',label:'Product'},{key:'attributeId',label:'Attribute'},{key:'value',label:'Value'}]} fields={[{name:'productId',label:'Product ID',type:'number',required:true},{name:'attributeId',label:'Attribute ID',type:'number',required:true},{name:'value',label:'Value',type:'text',required:true}]}/>;
}
