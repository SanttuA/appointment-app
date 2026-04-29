# ADR 0001: Monorepo With Separate Fastify API and Next.js Web App

## Decision

Use a pnpm monorepo with `apps/api` and `apps/web`.

## Context

The app needs a clear Node backend with Prisma and an independently testable frontend.

## Consequences

- API concerns such as RBAC, sessions, scheduling, audit logs, and OpenAPI stay in Fastify.
- Next.js focuses on localized UI and browser workflows.
- CI can test each app independently while sharing one repository.
