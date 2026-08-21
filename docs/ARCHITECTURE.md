# ERP Architecture Decision Record

## Frontend hhhhhhhh
vgvhgvgggggggggggggggggggggggggggggggggggggg
React + TypeScript + Vite.

### Routing
React Router owns application URLs:
- `/tenants`
- `/users`
- `/categories`
- `/suppliers`
- `/locations`
- `/products`
- `/product-suppliers`
- `/product-costing`

Do not use a home-grown `activeMenu` variable as routing.

### Server state
TanStack Query owns API/server state:
- loading
- caching
- refetching
- invalidation
- mutations

### Global state
React Context is reserved for small application-wide state such as the selected tenant and UI preferences.

### Local state
Forms use React local state.

### Redux
Not used initially. It can be introduced later only if complex client-side state genuinely requires it.

## Frontend structure

`features/<feature>/api`
`features/<feature>/pages`
`features/<feature>/components`
`features/<feature>/types`

Shared:
- `components/layout`
- `components/ui`
- `services/apiClient.ts`
- `config/env.ts`
- `contexts/`

## Backend

NestJS modules are organized by business capability.

Typical flow:
Controller -> DTO validation -> Service -> TypeORM Repository -> MySQL

Controllers stay thin. Business rules belong in services.

## Database

Shared MySQL database with tenant isolation using `tenant_id` on tenant-owned master data.

TypeORM is the ORM.

Local development and production must use:
`DB_SYNCHRONIZE=false`
and migrations.

## Security

Passwords are hashed with bcrypt.

JWT authentication, sessions, roles and permissions are reserved for the authentication phase. Backend authorization and tenant isolation are authoritative.

## API

A centralized API client handles:
- base URL
- JSON headers
- response parsing
- common HTTP errors

Feature APIs only describe business endpoints.

## Reference implementation

Tenant is the reference vertical slice. New ERP modules should follow the same architecture.
