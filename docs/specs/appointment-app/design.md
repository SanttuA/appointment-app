# Design

## Architecture

- pnpm monorepo with separate web and API apps.
- Next.js owns localized UI routes and browser interactions.
- Fastify owns REST API, validation, sessions, RBAC, audit records, and scheduling rules.
- Prisma owns data access with SQLite in v1.

## Localization

- Supported locales are `en` and `fi`.
- Default locale is `en`.
- Routes are always prefixed, for example `/en` and `/fi`.
- UI strings live in JSON message catalogs.
- API errors use stable codes and params instead of translated prose.

## Data

Core models:

- `User`
- `PatientProfile`
- `WorkerProfile`
- `Service`
- `WorkerService`
- `AvailabilityWindow`
- `TimeOff`
- `Appointment`
- `Session`
- `AuditLog`

Date-times are stored in UTC. Worker availability is expressed as weekday plus minute-of-day in the
worker timezone.
