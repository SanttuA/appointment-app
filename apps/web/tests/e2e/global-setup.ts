import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL ?? "file:/tmp/appointment-app-e2e.db";

function databasePathFromUrl(url: string) {
  if (!url.startsWith("file:")) {
    throw new Error("Playwright E2E setup only supports SQLite file: database URLs.");
  }

  const rawPath = url.slice("file:".length);
  return isAbsolute(rawPath) ? rawPath : resolve(repoRoot, "apps/api", rawPath);
}

function removeIfExists(path: string) {
  if (existsSync(path)) unlinkSync(path);
}

export default function globalSetup() {
  const databasePath = databasePathFromUrl(e2eDatabaseUrl);
  removeIfExists(databasePath);
  removeIfExists(`${databasePath}-shm`);
  removeIfExists(`${databasePath}-wal`);

  const env = {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET ?? "playwright-session-secret-playwright",
    CORS_ORIGIN: "http://localhost:3000",
  };

  execFileSync("pnpm", ["--filter", "@appointment/api", "db:migrate"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  execFileSync("pnpm", ["--filter", "@appointment/api", "db:seed:e2e"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}
