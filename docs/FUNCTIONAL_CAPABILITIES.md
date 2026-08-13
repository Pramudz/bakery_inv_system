# ERP Functional Capability Matrix

Every listed ERD entity now has a backend module and frontend route/page.

| Area | Backend | UI |
|---|---|---|
| Tenant | CRUD + deactivate | `/tenants` |
| User | Create/list/update/deactivate + bcrypt | `/users` |
| UserSession | CRUD/list | `/user-sessions` |
| Role | CRUD + deactivate | `/roles` |
| UserRole | CRUD/list | `/user-roles` |
| Module | CRUD + deactivate | `/modules` |
| Permission | CRUD + deactivate | `/permissions` |
| RolePermission | CRUD/list | `/role-permissions` |
| Category | CRUD + deactivate | `/categories` |
| Brand | CRUD + deactivate | `/brands` |
| UnitOfMeasure | CRUD + deactivate | `/units` |
| Product | CRUD + deactivate | `/products` |
| ProductIdentifier | CRUD + deactivate | `/product-identifiers` |
| IdentifierType | CRUD + deactivate | `/identifier-types` |
| ProductUnit | CRUD + deactivate | `/product-units` |
| Supplier | CRUD + deactivate | `/suppliers` |
| ProductSupplier | CRUD + deactivate | `/product-suppliers` |
| ProductSupplierPrice | Create/list | `/product-costing` |
| PriceList | CRUD + deactivate | `/price-lists` |
| PriceListItem | CRUD + deactivate | `/price-list-items` |
| Location | CRUD + deactivate | `/locations` |
| ProductLocation | CRUD + deactivate | `/product-locations` |
| Attribute | CRUD + deactivate | `/attributes` |
| ProductAttributes | CRUD + deactivate | `/product-attributes` |

## Important implementation note

The first UI pass is deliberately generic and functional. It is a scaffold/reference implementation, not the final polished ERP workflow.

The next phase should replace generic ID fields with lookup/dropdown components and enforce tenant context from authentication rather than accepting tenant IDs from the browser.
