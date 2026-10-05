# ERP Backend

NestJS + TypeORM + MySQL.

Start:
`npm install`
`copy .env.example .env`
`npm run start:dev`

The database/schema must exist before TypeORM connects.
Use `DB_SYNCHRONIZE=false` and run `npm run migration:run`. TypeORM schema
synchronization can rebuild MySQL tables and conflict with foreign-key indexes.
This applies pending tenant profile schema updates, including the optional
`business_category` column. The tenant `registration_number` column is already
part of the existing tenant schema.
