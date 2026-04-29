import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @appointment/api dev",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "file:./prisma/local/dev.db",
        SESSION_SECRET: process.env.SESSION_SECRET ?? "playwright-session-secret-playwright",
        CORS_ORIGIN: "http://localhost:3000",
      },
    },
    {
      command: "pnpm --filter @appointment/web dev",
      url: "http://localhost:3000/en",
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
