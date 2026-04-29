# Local Development Guide

1. Install Node `24.15.0` and pnpm `10.33.0`.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env`.
4. Run `pnpm --filter @appointment/api db:generate`.
5. Run `pnpm --filter @appointment/api db:push`.
6. Run `pnpm db:seed`.
7. Run `pnpm dev`.

Local SQLite defaults to `apps/api/prisma/local/dev.db`, which is ignored by Git.

Useful URLs:

- Web: `http://localhost:3000/en`
- Finnish UI: `http://localhost:3000/fi`
- API docs: `http://localhost:4000/docs`
- API health: `http://localhost:4000/health`
