import type { Page } from "@playwright/test";

export function inputDateFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthDistance(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
}

export async function routeCatalog(
  page: Page,
  input: {
    services: unknown[];
    workers: unknown[];
  },
) {
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: input.services } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({ json: { workers: input.workers } });
  });
}

export async function routeSession(page: Page, user: unknown) {
  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({ json: { user } });
  });
}

export async function routeWorkerSlots(page: Page, workerId: string, slots: unknown[] = []) {
  await page.route(
    new RegExp(`http://localhost:4000/workers/${workerId}/slots.*`),
    async (route) => {
      await route.fulfill({ json: { slots } });
    },
  );
}
