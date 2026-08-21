# ERP Backend

NestJS + TypeORM + MySQL.

Start:
`npm install`
`copy .env.example .env`
`npm run start:dev`

The database/schema must exist before TypeORM connects.
Use `DB_SYNCHRONIZE=false` and run `npm run migration:run`. TypeORM schema
synchronization can rebuild MySQL tables and conflict with foreign-key indexes.
