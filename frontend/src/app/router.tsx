import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { PlatformOnlyRoute } from '../features/auth/PlatformOnlyRoute';
import { TenantOnlyRoute } from '../features/auth/TenantOnlyRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { TenantLoginPage } from '../features/auth/TenantLoginPage';

import { DashboardPage } from '../pages/DashboardPage';
import { TenantsPage } from '../features/tenants/pages/TenantsPage';
import { TenantProfilePage } from '../features/tenants/pages/TenantProfilePage';
import { UsersPage } from '../features/users/pages/UsersPage';
import { CategoriesPage } from '../features/categories/pages/CategoriesPage';
import { SuppliersPage } from '../features/suppliers/pages/SuppliersPage';
import { LocationsPage } from '../features/locations/pages/LocationsPage';
import { ProductsPage } from '../features/products/pages/ProductsPage';
import { ProductSuppliersPage } from '../features/product-suppliers/pages/ProductSuppliersPage';
import { ProductCostingPage } from '../features/product-costing/pages/ProductCostingPage';
import { BrandsPage } from '../features/brands/pages/BrandsPage';
import { IdentifierTypesPage } from '../features/identifier-types/pages/IdentifierTypesPage';
import { ProductIdentifiersPage } from '../features/product-identifiers/pages/ProductIdentifiersPage';
import { ProductLocationsPage } from '../features/product-locations/pages/ProductLocationsPage';
import { AttributesPage } from '../features/attributes/pages/AttributesPage';
import { ProductAttributesPage } from '../features/product-attributes/pages/ProductAttributesPage';
import { PriceListsPage } from '../features/price-lists/pages/PriceListsPage';
import { ModulesPage } from '../features/modules/pages/ModulesPage';
import { RolesPage } from '../features/roles/pages/RolesPage';
import { PermissionsPage } from '../features/permissions/pages/PermissionsPage';
import { UserRolesPage } from '../features/user-roles/pages/UserRolesPage';
import { RolePermissionsPage } from '../features/role-permissions/pages/RolePermissionsPage';
import { UnitsPage } from '../features/units/pages/UnitsPage';
import { ProductUnitsPage } from '../features/product-units/pages/ProductUnitsPage';
import { UserSessionsPage } from '../features/user-sessions/pages/UserSessionsPage';

const tenantChildren = [
  { path:'my-tenant', element:<TenantProfilePage/> },
  { path:'users', element:<UsersPage/> },
  { path:'categories', element:<CategoriesPage/> },
  { path:'suppliers', element:<SuppliersPage/> },
  { path:'locations', element:<LocationsPage/> },
  { path:'products', element:<ProductsPage/> },
  { path:'product-suppliers', element:<ProductSuppliersPage/> },
  { path:'product-costing', element:<ProductCostingPage/> },
  { path:'brands', element:<BrandsPage/> },
  { path:'identifier-types', element:<IdentifierTypesPage/> },
  { path:'product-identifiers', element:<ProductIdentifiersPage/> },
  { path:'product-locations', element:<ProductLocationsPage/> },
  { path:'attributes', element:<AttributesPage/> },
  { path:'product-attributes', element:<ProductAttributesPage/> },
  { path:'price-lists', element:<PriceListsPage/> },
  { path:'modules', element:<ModulesPage/> },
  { path:'roles', element:<RolesPage/> },
  { path:'permissions', element:<PermissionsPage/> },
  { path:'user-roles', element:<UserRolesPage/> },
  { path:'role-permissions', element:<RolePermissionsPage/> },
  { path:'units', element:<UnitsPage/> },
  { path:'product-units', element:<ProductUnitsPage/> },
  { path:'user-sessions', element:<UserSessionsPage/> },
];

export const router = createBrowserRouter([
  { path:'/login', element:<LoginPage/> },
  { path:'/tenant-login', element:<TenantLoginPage/> },
  {
    path:'/',
    element:<ProtectedRoute/>,
    children:[
      {
        element:<App/>,
        children:[
          { index:true, element:<DashboardPage/> },
          {
            element:<PlatformOnlyRoute/>,
            children:[
              { path:'tenants', element:<TenantsPage/> },
            ],
          },
          {
            element:<TenantOnlyRoute/>,
            children: tenantChildren,
          },
        ],
      },
    ],
  },
]);
