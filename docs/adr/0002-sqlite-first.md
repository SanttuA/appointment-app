# ADR 0002: SQLite First, PostgreSQL Later

## Decision

Use SQLite as the active v1 database and keep Prisma models portable for PostgreSQL later.

## Context

The requested local development flow should be easy and host-first. SQLite avoids requiring a local
database server and fits the light Docker production target.

## Consequences

- Local setup is fast.
- Production uses a mounted SQLite volume and documented backup/restore commands.
- PostgreSQL migration remains future work and must include a migration baseline plus database-specific
  integration testing.
