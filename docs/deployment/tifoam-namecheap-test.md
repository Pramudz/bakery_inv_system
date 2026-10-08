# Tifoam test deployment on Namecheap Stellar Plus

This deployment uses **one Node.js 24 cPanel application** at `https://tifoam.prosincsoft.com/`. NestJS handles `/api/*` and serves the compiled React application at `/`. The app uses one dedicated Tifoam database; no tenant database router is involved. This guide does not authorize running migrations against the hosting database.

## What the repository does

- `backend/src/main.ts` registers the global `/api` prefix and listens once on `PORT` (default `3000`). Passenger may assign its own socket. Production disables the cross-origin CORS middleware; the browser calls the same origin.
- `backend/src/app.module.ts` serves the React files through `@nestjs/serve-static`. Its fallback excludes `/api/*` and missing `/assets/*`, so unknown API routes remain JSON 404 responses. `backend/src/static-app.ts` resolves the compiled frontend from the deployment layout.
- `frontend/src/config/env.ts` sets the production API base to `/api`; `frontend/src/services/apiClient.ts` appends routes such as `/auth/login`. A local `frontend/.env` setting cannot place a localhost URL in the production API base.
- Authentication uses bearer tokens: `frontend/src/features/auth/AuthContext.tsx` stores the token and expiry in localStorage, and the API sends it as `Authorization: Bearer`. `backend/src/features/auth/auth.service.ts` stores token hashes in database session tables with eight-hour expiry. A Node restart does not invalidate an unexpired database session. Test login, logout, expiry, and refresh after deployment.
- `backend/src/common/media-storage.service.ts` writes tenant logos under `<application root>/uploads/tenant-logos`. `server.js` sets the working directory to the application root. Keep `uploads/` writable and preserve it across releases.
- Runtime TypeORM `synchronize` is fixed to `false`, as is `backend/src/data-source.ts`. `DB_SYNCHRONIZE` is no longer honored by the runtime. Schema changes require reviewed migrations.

## Build and package locally

From the repository root, with Node.js 24 and npm:

```powershell
cd backend
npm ci
npm test
npm run build
cd ../frontend
npm ci
npm test
npm run build
cd ..
node scripts/package-tifoam.cjs
powershell -File scripts/zip-tifoam.ps1
```

Upload the **contents** of `build/tifoam-package/` (or extract `build/tifoam-test.zip` directly) into the cPanel application root. The package contains:

```text
server.js
package.json
package-lock.json
backend/dist/**
frontend/dist/**
schema/baseline-1770000023000.sql
scripts/tifoam-db-check.cjs
scripts/tifoam-initial-data.cjs
docs/deployment/tifoam-empty-test-database.md
docs/deployment/tifoam-namecheap-test.md
```

It contains no source `.env`, database password, frontend environment file, or `node_modules`. The generated root `package.json` starts with `node server.js`. `backend/nest-cli.json` clears old compiled files on every build so an artifact cannot retain code from another branch.

## cPanel setup

1. Create the subdomain `tifoam.prosincsoft.com`, enable HTTPS, and create a **Node.js 24** application in **Setup Node.js App**. Choose application URL `tifoam.prosincsoft.com/`, an application root outside `public_html`, startup file `server.js`, and production mode. Keep the application root distinct from the subdomain document root; cPanel/Passenger routes the application URL to Node.
2. Upload and extract the package contents in that application root. In the cPanel app environment, set `NODE_ENV=production`, `DB_TYPE=mariadb`, `DB_HOST`, `DB_PORT` (usually `3306`, verify in cPanel), `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` for the dedicated Tifoam database. Set `PORT` only if the hosting environment supplies/requires it; the app defaults to `3000` and Passenger intercepts the single `listen()` call. Do not set `VITE_API_URL` on the server; the browser bundle is already built for `/api`. Do not set `DB_BASELINE_CONFIRM` or enable `DB_SYNCHRONIZE`.
3. In the cPanel terminal for the app's Node virtual environment, run `npm ci --omit=dev` from the application root (or use cPanel's **Run NPM Install**). Verify that the native `bcrypt` dependency installs for the hosting Node version. Keep the app stopped until the database initialization guide reaches platform-ready; then start/restart through cPanel. If testing outside Passenger, run `NODE_ENV=production node server.js` from the package root with a **disposable, prepared** database; the app attempts a DB connection on startup.
4. Make `uploads/` writable by the app user, and preserve that directory when deploying a replacement package. Restart from cPanel after replacing files. Keep the app root and cPanel environment variables inaccessible from the web document root.
5. Once a database has been prepared and reviewed separately, smoke test `/` and a deep React route by refreshing the browser, then check `/api/auth/login` through the UI. Unknown `/api/*` should return a JSON 404, and a missing `/assets/*` should return 404. Confirm login, permissions, tenant scoping, logout, refresh, and a logo upload on test data.

The application cannot provide a functional login against an empty database. Database preparation is a separate gate below.

## MariaDB 11.4 compatibility gate

The schema and migrations were written for MySQL 8. The hosting MariaDB 11.4.13 server recognizes `utf8mb4_0900_ai_ci`; MariaDB documents that name as an alias, so collation recognition alone does not establish migration compatibility. The older `backend/scripts/bootstrap-database.cjs` tries to create the database and is unsuitable for the already-created cPanel database. Use [the empty test database initialization guide](./tifoam-empty-test-database.md) for the packaged baseline, compiled migrations, ledger checks, offline initial data, and recreation procedure. No database operation was executed in preparing this package.

For the dedicated disposable Tifoam TEST database, validate on MariaDB **11.4.13-MariaDB-cll-lve-log**:

1. Inspect the baseline SQL for collations, SQL mode dependencies, DDL, and its 24-entry migration ledger. Import the unchanged baseline only into an empty test database; never rerun it over a partial schema.
2. Import the unchanged baseline into a fresh disposable database and verify table definitions, foreign keys, indexes, initial data, and the ledger cutoff `1770000023000`.
3. Set `DB_TYPE=mariadb` and the disposable DB credentials, then inspect `migration:show` and run the post-baseline migrations **only on that disposable database**. Check generated stored columns and unique indexes (supplier primary guards, number sequence guard, POS open-session guards), enum modifications, `datetime(3)` conversions, and `ON DUPLICATE KEY UPDATE` statements. MariaDB DDL can implicitly commit, so verify failure/retry behavior and do not assume transaction rollback will reverse a failed schema change.
4. Compare the final schema with the TypeORM entities, then exercise login/session persistence, tenant-scoped CRUD, price history, numbering, and POS register workflows against the disposable database. Repeat from a clean database and from a representative backup of an existing schema if this will be an upgrade.
5. Review the test results and a separate database rollout/backup plan before any later production deployment. No hosting migration was executed as part of this preparation.

The app supports `DB_TYPE=mysql` (default) for existing MySQL installations and `DB_TYPE=mariadb` for a tested MariaDB installation. Driver selection alone does **not** establish schema compatibility.

## Known deployment limits

- This repository has no automated MariaDB 11.4 integration test environment; the compatibility gate above remains open.
- A compiled frontend and backend can be packaged now, but a running app needs a reviewed, initialized database. cPanel resource limits, filesystem permissions, HTTPS/subdomain routing, and `bcrypt` installation must be checked on the actual hosting account.
- The current production frontend bundle is about 1 MB of JavaScript before compression; Vite reports a chunk-size warning. This does not stop the build, but first-load performance should be measured on shared hosting.

Local builds and tests ran on Node.js 24.19.0. The hosting runtime is 24.21.0; native bcrypt, app startup, and MariaDB migration compatibility on that exact runtime still require a hosting smoke test.
