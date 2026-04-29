# Healthcare Appointment App

Accessible appointment booking for patients, healthcare workers, and admins.

## Stack

- `apps/web`: Next.js, React, TypeScript, Tailwind, `next-intl`
- `apps/api`: Fastify, Prisma, SQLite, cookie sessions, RBAC
- Tooling: pnpm, oxlint, Prettier, Vitest, Playwright, Docker Compose

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm --filter @appointment/api db:generate
pnpm --filter @appointment/api db:push
pnpm db:seed
pnpm dev
```

Open:

- Web: http://localhost:3000/en or http://localhost:3000/fi
- API health: http://localhost:4000/health
- API docs: http://localhost:4000/docs

Seeded demo users use password `DemoPassword123!`:

- `admin@example.com`
- `worker@example.com`
- `patient@example.com`

## Common Commands

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm e2e
pnpm build
```

## Light Production With Docker

Set production secrets, then build and run:

```bash
export SESSION_SECRET="$(openssl rand -base64 48)"
export CORS_ORIGIN="http://localhost:3000"
export NEXT_PUBLIC_API_URL="http://localhost:4000"
pnpm docker:prod:build
pnpm docker:prod:up
```

The production compose file stores SQLite in the named volume `appointment-sqlite`.

Backup:

```bash
docker compose -f docker-compose.prod.yml exec api \
  cp /app/apps/api/prisma/local/prod.db /tmp/prod.db
docker compose -f docker-compose.prod.yml cp api:/tmp/prod.db ./prod.db.backup
```

Restore:

```bash
docker compose -f docker-compose.prod.yml cp ./prod.db.backup api:/tmp/prod.db
docker compose -f docker-compose.prod.yml exec api \
  cp /tmp/prod.db /app/apps/api/prisma/local/prod.db
docker compose -f docker-compose.prod.yml restart api
```

## Internationalization

The app currently supports English and Finnish with path-prefixed routes:

- `/en`
- `/fi`

To add a language, add a locale in `apps/web/src/i18n/routing.ts`, create a matching
`apps/web/messages/<locale>.json`, and update the translation parity test.

## PostgreSQL Later

SQLite is the active v1 database. The Prisma schema avoids SQLite-specific features where practical.
For PostgreSQL later, update the Prisma datasource provider, set a PostgreSQL `DATABASE_URL`, create a
new migration baseline, and run the existing API tests against the PostgreSQL test database before
cutover.
