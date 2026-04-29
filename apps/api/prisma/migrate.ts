import "dotenv/config";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");

function databasePathFromUrl(url: string) {
  if (!url.startsWith("file:")) {
    throw new Error("Only SQLite file: URLs are supported by the v1 migration runner.");
  }

  const rawPath = url.slice("file:".length);
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/local/dev.db";
const databasePath = databasePathFromUrl(databaseUrl);
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS "_app_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const applied = new Set(
  db
    .prepare(`SELECT "id" FROM "_app_migrations"`)
    .all()
    .map((row) => (row as { id: string }).id),
);

const migrations = existsSync(migrationsDir)
  ? readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

for (const migration of migrations) {
  if (applied.has(migration)) continue;

  const sqlPath = join(migrationsDir, migration, "migration.sql");
  const sql = readFileSync(sqlPath, "utf8");

  db.transaction(() => {
    db.exec(sql);
    db.prepare(`INSERT INTO "_app_migrations" ("id") VALUES (?)`).run(migration);
  })();

  console.log(`Applied migration ${migration}`);
}

console.log(`Database is ready at ${databasePath}`);
db.close();
