# Entity Relationship Map — Backend V2

This version keeps the existing working table/column naming convention and corrects the ORM relationship layer to match `current(1).dbml`.

## Core rule
Every foreign-key column is represented twice in the entity where useful:
- the scalar FK (`productId`, `tenantId`, etc.)
- the TypeORM relation (`product`, `tenant`, etc.)

The relation owns the same database column through `@JoinColumn`.

## Relationships
- User -> Tenant; User -> UserRole; User -> UserSession
- UserRole -> User; UserRole -> Role
- Role -> Tenant; Role -> UserRole; Role -> RolePermission
- Permission -> Module; Permission -> RolePermission
- RolePermission -> Role; RolePermission -> Permission
- Category -> Tenant; Category -> parent Category; Category -> Products
- Brand -> Tenant; Brand -> Products
- UnitOfMeasure -> Tenant; UnitOfMeasure -> base Products; UnitOfMeasure -> ProductUnits; UnitOfMeasure -> PriceListItems
- Product -> Tenant, Category, Brand, Base Unit; Product -> Identifiers, ProductUnits, ProductSuppliers, PriceListItems, ProductLocations, ProductAttributes
- ProductIdentifier -> Product, IdentifierType
- ProductUnit -> Product, Unit; ProductUnit -> ProductSupplier purchase units and supplier prices
- Supplier -> Tenant; Supplier -> ProductSuppliers
- ProductSupplier -> Product, Supplier, Purchase ProductUnit; ProductSupplier -> Prices
- ProductSupplierPrice -> ProductSupplier, ProductUnit
- PriceList -> Tenant; PriceList -> Items
- PriceListItem -> PriceList, Product, Unit
- Location -> Tenant; Location -> ProductLocations
- ProductLocation -> Product, Location
- Attribute -> Tenant; Attribute -> ProductAttributes
- ProductAttributes -> Product, Attribute
- Module -> Permissions

## Tenant context
The FK is retained because it is part of the physical model. Normal tenant-owned create/update APIs should eventually derive the tenant from the authenticated user rather than accept an arbitrary tenant ID from the browser. This V2 is focused on making the ORM model correct first.
