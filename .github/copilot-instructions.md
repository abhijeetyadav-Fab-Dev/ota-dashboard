# Copilot Instructions

## Build, Test, and Lint Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server with hot-reload |
| `npm run build` | Build for production (includes `prisma generate`) |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint |

**Single test**: No test runner is configured. When adding tests, use `npm test -- <path/to/test>`.

**Database commands**:
- `npx prisma generate` — Regenerate Prisma client after schema changes
- `npx prisma migrate dev` — Run migrations in development
- `npx prisma db push` — Push schema to database (for quick syncing)
- `npx prisma studio` — Open Prisma Studio (GUI for database)

**Type-checking** (without emitting files):
```bash
npx tsc --noEmit
```

---

## High-Level Architecture

### Stack
- **Framework**: Next.js 15 (App Router) with TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: JWT stored in `ota_session` cookie, validated by `middleware.ts`
- **Styling**: Tailwind CSS

### Directory Structure
```
app/
  api/          # REST endpoints (route.ts files)
  crm/          # CRM pages
  listing-dashboard/
  listings/
  login/
  ota/
  performance/
  reports/
  team/
  tl-performance/
  workflow/
components/    # Reusable React components
contexts/       # React contexts (e.g., DashboardContext)
hooks/          # Custom React hooks
lib/
  auth.ts       # JWT sign/verify helpers
  prisma.ts     # Prisma client singleton
  data.ts       # Static data constants
  utils.ts
prisma/
  schema.prisma # Prisma schema for PostgreSQL
```

### Database
- Prisma schema at `prisma/schema.prisma` generates client to `lib/generated/prisma`
- Connection via `DATABASE_URL` environment variable
- Default admin: `admin` / `admin123` (change in production)

### Authentication Flow
1. `middleware.ts` guards all routes except `/login` and `/api/auth/login`
2. `lib/auth.ts` — `signSession()`, `verifySession()`, `getSession()`
3. JWT uses HS256 with `SESSION_SECRET` env var

### API Route Pattern
API routes live in `app/api/<resource>/route.ts` and export named HTTP method handlers:
```ts
export async function GET(req: Request) { ... }
export async function POST(req: Request) { ... }
```

---

## Key Conventions

### Adding a new page
- UI pages: `app/<section>/page.tsx`
- API routes: `app/api/<resource>/route.ts`

### Database access pattern
- Use Prisma client from `lib/prisma.ts` (`import { db } from "@/lib/prisma"`)
- For raw SQL queries, use `db.$queryRaw`

### Date storage
- Dates stored as ISO strings (`YYYY-MM-DD`)
- Timestamps stored as ISO strings (e.g., `new Date().toISOString()`)

### Environment variables
- Copy `.env.example` to `.env.local`
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — JWT signing key (min 32 chars, generate with `openssl rand -base64 32`)

### Deployment
- `Dockerfile` — Multi-stage production build
- `docker-compose.yml` — Local development with PostgreSQL
- `coolify.json` — Coolify deployment specification
- `migrate.bat` / `migrate.sh` — Database migration scripts

### Database Setup
1. Create a free PostgreSQL database (Neon, Supabase, or any PostgreSQL provider)
2. Get the connection string (URI format)
3. Run the migration script:
   - Windows: `migrate.bat "postgresql://..."`
   - Linux/Mac: `./migrate.sh "postgresql://..."`
4. Or manually:
   ```bash
   export DATABASE_URL="postgresql://..."
   npm install
   npx prisma generate
   npx prisma db push
   ```

---

## Docker / Coolify Deployment

### Local Development with Docker
```bash
docker-compose up -d  # Starts Next.js + PostgreSQL
```

### Coolify Deployment
1. Push code to a Git repository
2. In Coolify, create a new application and link the repository
3. Add a PostgreSQL database addon
4. Set environment variables:
   - `DATABASE_URL` (from PostgreSQL addon)
   - `SESSION_SECRET` (generate with `openssl rand -base64 32`)
   - `NODE_ENV=production`
5. Deploy — Coolify will run `prisma migrate deploy` automatically

---

## Prisma Workflow
After any schema change:
1. Update `prisma/schema.prisma`
2. Run `npx prisma generate`
3. Run `npx prisma migrate dev` (dev) or `prisma migrate deploy` (prod)

## Build, Test, and Lint Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server with hot-reload |
| `npm run build` | Build for production |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint |

**Single test**: No test runner is configured. When adding tests, use `npm test -- <path/to/test>`.

**Database commands**:
- `npx prisma generate` — Regenerate Prisma client after schema changes
- `npx prisma migrate dev` — Run migrations in development

**Type-checking** (without emitting files):
```bash
npx tsc --noEmit
```

---

## High-Level Architecture

### Stack
- **Framework**: Next.js 15 (App Router) with TypeScript
- **Database**: SQLite via `better-sqlite3` + Prisma ORM
- **Auth**: JWT stored in `ota_session` cookie, validated by `middleware.ts`
- **Styling**: Tailwind CSS

### Directory Structure
```
app/
  api/          # REST endpoints (route.ts files)
  crm/          # CRM pages
  listing-dashboard/
  listings/
  login/
  ota/
  performance/
  reports/
  team/
  tl-performance/
  workflow/
components/    # Reusable React components
contexts/       # React contexts (e.g., DashboardContext)
hooks/          # Custom React hooks
lib/
  auth.ts       # JWT sign/verify helpers
  db.ts         # SQLite connection + schema init (migrations embedded)
  data.ts       # Data access layer (uses better-sqlite3 directly)
  utils.ts
prisma/
  schema.prisma # Prisma schema (generates client to lib/generated/prisma)
```

### Database
- Prisma schema at `prisma/schema.prisma` generates client to `lib/generated/prisma`
- **Migrations are embedded in `lib/db.ts`**: `initSchema()` creates tables and runs ALTER TABLE for existing DBs
- Database path: `process.env.OTA_DB_PATH ?? "../ota-inv-db/data/ota.db"`
- Default admin: `admin` / `admin123` (change in production)

### Authentication Flow
1. `middleware.ts` guards all routes except `/login` and `/api/auth/login`
2. `lib/auth.ts` — `signSession()`, `verifySession()`, `getSession()`
3. JWT uses HS256 with `SESSION_SECRET` env var

### API Route Pattern
API routes live in `app/api/<resource>/route.ts` and export named HTTP method handlers:
```ts
export async function GET(req: Request) { ... }
export async function POST(req: Request) { ... }
```

---

## Key Conventions

### Adding a new page
- UI pages: `app/<section>/page.tsx`
- API routes: `app/api/<resource>/route.ts`

### Database access pattern
- Use Prisma client from `lib/generated/prisma` for new queries
- Some legacy code uses `better-sqlite3` directly via `lib/db.ts` `getDb()`
- When modifying schema, update `lib/db.ts` migration logic too

### Date storage
- Dates stored as ISO strings (`YYYY-MM-DD`) in both Prisma schema and SQLite
- Timestamps stored as ISO strings (e.g., `new Date().toISOString()`)

### Environment variables
- Copy `.env.example` to `.env.local`
- `SESSION_SECRET` — JWT signing key (default placeholder is not for production)
- `OTA_DB_PATH` — Absolute path to SQLite database

### Deployment
- `ecosystem.config.js` for PM2 process manager
- Windows startup scripts: `start-dashboard-*.bat`, `run-dashboard-service.ps1`

---

## Prisma Workflow
After any schema change:
1. Update `prisma/schema.prisma`
2. Update `lib/db.ts` `initSchema()` with corresponding ALTER TABLE (for existing DBs)
3. Run `npx prisma generate`
4. Run `npx prisma migrate dev`
