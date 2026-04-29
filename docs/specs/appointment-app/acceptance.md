# Acceptance Criteria

- `pnpm dev` starts the web and API apps.
- `/en` and `/fi` render localized UI with matching translation keys.
- Patients can register, sign in, view slots, book, list, and cancel appointments.
- Workers can update weekday availability.
- Admins can create users and services.
- API denies unauthorized role access.
- SQLite data is stored in ignored local files for development and a mounted Docker volume in production.
- CI runs typecheck, lint, format check, unit tests, E2E tests, builds, and Docker image validation.
