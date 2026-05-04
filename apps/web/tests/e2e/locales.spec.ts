import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function inputDateFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthDistance(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
}

test("renders the English and Finnish entry points", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Healthcare appointments" })).toBeVisible();

  await page.goto("/fi");
  await expect(page.getByRole("heading", { name: "Terveydenhuollon ajanvaraus" })).toBeVisible();
});

test("primary page has no obvious accessibility violations", async ({ page }) => {
  await page.goto("/en");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("calendar selection recenters the 14-day date strip", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Healthcare appointments" })).toBeVisible();

  const tomorrow = inputDateFromToday(1);
  const farDate = inputDateFromToday(28);
  const navigationCount = monthDistance(tomorrow, farDate);

  for (let index = 0; index < navigationCount; index += 1) {
    await page.getByRole("button", { name: "Next month" }).click();
  }

  await page.getByTestId(`calendar-date-${farDate}`).click();
  await expect(page.getByTestId(`strip-date-${farDate}`)).toBeVisible();
  await expect(page.getByTestId(`strip-date-${farDate}`)).toHaveAttribute("aria-pressed", "true");
});

test("initial slot load uses a service offered by the selected worker", async ({ page }) => {
  const unsupportedService = {
    active: true,
    description: { en: null, fi: null },
    id: "service-global-first",
    name: { en: "Global first service", fi: "Ensimmäinen palvelu" },
  };
  const supportedService = {
    active: true,
    description: { en: null, fi: null },
    id: "service-worker-supported",
    name: { en: "Worker service", fi: "Työntekijän palvelu" },
  };
  let invalidSlotRequest = false;
  let supportedSlotRequest = false;

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({ json: { user: null } });
  });
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [unsupportedService, supportedService] } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({
      json: {
        workers: [
          {
            active: true,
            appointmentDurationMinutes: 30,
            id: "worker-one",
            location: "Main clinic",
            name: "Dr. Supported Service",
            services: [supportedService],
            timezone: "Europe/Helsinki",
            title: "General practitioner",
          },
        ],
      },
    });
  });
  await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
    const url = new URL(route.request().url());
    const serviceId = url.searchParams.get("serviceId");
    invalidSlotRequest ||= serviceId !== supportedService.id;
    supportedSlotRequest ||= serviceId === supportedService.id;
    await route.fulfill({ json: { slots: [] } });
  });

  await page.goto("/en");

  await expect(page.locator("select").nth(1)).toHaveValue(supportedService.id);
  await expect.poll(() => supportedSlotRequest).toBe(true);
  expect(invalidSlotRequest).toBe(false);
});
