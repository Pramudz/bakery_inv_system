# ERP Backend

NestJS + TypeORM + MySQL.

Start:
`npm install`
`copy .env.example .env`
`npm run start:dev`

The database/schema must exist before TypeORM connects.
`DB_SYNCHRONIZE=true` creates/updates tables from entities in local development.
