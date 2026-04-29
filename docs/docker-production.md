# Docker Production Guide

This repository includes a light single-node Docker Compose setup for small deployments and demos.

It provides:

- production web and API images
- SQLite stored on a named Docker volume
- healthchecks
- restart policies
- non-root runtime users

Start:

```bash
export SESSION_SECRET="$(openssl rand -base64 48)"
export CORS_ORIGIN="http://localhost:3000"
export NEXT_PUBLIC_API_URL="http://localhost:4000"
docker compose -f docker-compose.prod.yml up -d --build
```

Run migrations inside the API container when deploying schema changes:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm db:deploy
```

This setup does not terminate TLS. Put a reverse proxy in front of it for internet-facing production.
