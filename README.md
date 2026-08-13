# ERP Starter — Architecture Reference Implementation

This project is a working reference implementation of the ERP architecture we agreed on.

## Stack
- Frontend: React + TypeScript + Vite
- Routing: React Router
- Server state: TanStack Query
- Global UI state: React Context
- HTTP: centralized API client
- Backend: NestJS + TypeScript
- ORM: TypeORM
- Database: MySQL
- Validation: class-validator / class-transformer
- Password hashing: bcrypt
- Production DB evolution: TypeORM migrations
- Redux: intentionally not used initially

## Functional modules included

The implementation now covers all entities listed in the requested ERD slice, including the RBAC/session, brand, identifier, price-list, location, attribute and product-assignment entities.

Backend + frontend:
- Tenant
- User
- Category
- Supplier
- Location
- Unit of Measure
- Product
- Product Supplier
- Product Supplier Costing

Each functional module supports fetching data and the core create/update/deactivate operations where applicable.

## Database
The uploaded ER/dbdiagram design is preserved as:
`docs/erp-master.dbml`

The implementation uses the same logical model for the requested MVP slice. Physical table names are prefixed with `tbl_` in TypeORM entities.

## Run

### 1. Create the MySQL database
The application can create/update TABLES with TypeORM `synchronize=true`, but MySQL itself still needs the database/schema to exist.

Create:
`erp_dev`

### 2. Backend
```powershell
cd backend
copy .env.example .env
npm install
npm run start:dev
```

Backend:
`http://localhost:3000/api`

### 3. Frontend
```powershell
cd frontend
copy .env.example .env.development
npm install
npm run dev
```

Frontend:
`http://localhost:5173`

## Production rule
Use:
`DB_SYNCHRONIZE=false`

and TypeORM migrations for production. Do not use synchronize=true in production.

## Important multi-tenant rule
For the MVP, tenant-owned master data accepts `tenantId` in create requests and list filters. Once JWT authentication is added, tenant context MUST come from the authenticated user/session and the backend must enforce tenant isolation. The frontend must never be the security boundary.

## Architecture
See:
`docs/ARCHITECTURE.md`
