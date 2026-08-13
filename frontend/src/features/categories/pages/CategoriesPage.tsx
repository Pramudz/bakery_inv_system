import { CrudPage } from '../../../components/ui/CrudPage';
import { categoriesApi } from '../api/categoriesApi';
export function CategoriesPage(){
  return <CrudPage title="Categories" subtitle="Hierarchical product categories." queryKey="categories" api={categoriesApi} columns={[{key:'id',label:'ID'},{key:'tenantId',label:'Tenant'},{key:'categoryCode',label:'Code'},{key:'categoryName',label:'Name'},{key:'isActive',label:'Status'}]} fields={[{name:'parentCategoryId',label:'Parent category',emptyValue:null,options:(categories,editing)=>categories.filter(category=>category.categoryId!==editing?.categoryId).map(category=>({value:category.categoryId,label:`${category.categoryName} (${category.categoryCode})`}))},{name:'categoryCode',label:'Code',type:'text',required:true},{name:'categoryName',label:'Name',type:'text',required:true},{name:'description',label:'Description',type:'text',required:false},{name:'sortOrder',label:'Sort order',type:'number',required:false}]}/>;
}
