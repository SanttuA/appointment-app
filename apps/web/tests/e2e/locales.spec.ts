import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function inputDateFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

test("stale slot responses do not overwrite newer filter results", async ({ page }) => {
  const tomorrow = inputDateFromToday(1);
  const firstService = {
    active: true,
    description: { en: null, fi: null },
    id: "service-slow",
    name: { en: "Slow service", fi: "Hidas palvelu" },
  };
  const secondService = {
    active: true,
    description: { en: null, fi: null },
    id: "service-fast",
    name: { en: "Fast service", fi: "Nopea palvelu" },
  };

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({ json: { user: null } });
  });
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [firstService, secondService] } });
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
            name: "Dr. Race Condition",
            services: [firstService, secondService],
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
    if (serviceId === firstService.id) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        json: {
          slots: [
            {
              endsAt: `${tomorrow}T09:30:00.000Z`,
              startsAt: `${tomorrow}T09:00:00.000Z`,
              status: "AVAILABLE",
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: { slots: [] } });
  });

  await page.goto("/en");

  await expect(page.locator("select").nth(1)).toHaveValue(firstService.id);
  await page.locator("select").nth(1).selectOption(secondService.id);
  await expect(page.locator("select").nth(1)).toHaveValue(secondService.id);
  await expect(page.getByText("No times are available for this date.")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("button", { name: "Book" })).toHaveCount(0);
});

test("worker settings save uses a single atomic request", async ({ page }) => {
  const service = {
    active: true,
    description: { en: null, fi: null },
    id: "service-worker-settings",
    name: { en: "Settings service", fi: "Asetuspalvelu" },
  };
  const worker = {
    active: true,
    appointmentDurationMinutes: 30,
    id: "worker-one",
    location: "Original clinic",
    name: "Dr. Atomic Settings",
    services: [service],
    timezone: "Europe/Helsinki",
    title: "General practitioner",
  };
  const settingsRequests: unknown[] = [];
  let splitProfileRequest = false;
  let splitAvailabilityRequest = false;

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({
      json: {
        user: {
          email: "worker@example.com",
          id: "worker-user",
          name: "Dr. Atomic Settings",
          phone: null,
          preferredLocale: "en",
          role: "WORKER",
          workerProfile: worker,
        },
      },
    });
  });
  await page.route("http://localhost:4000/appointments", async (route) => {
    await route.fulfill({ json: { appointments: [] } });
  });
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [service] } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({ json: { workers: [worker] } });
  });
  await page.route("http://localhost:4000/worker/profile", async (route) => {
    splitProfileRequest = true;
    await route.fulfill({ json: { worker } });
  });
  await page.route("http://localhost:4000/worker/availability", async (route) => {
    splitAvailabilityRequest = true;
    await route.fulfill({ json: { windows: [] } });
  });
  await page.route("http://localhost:4000/worker/settings", async (route) => {
    settingsRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: { windows: [], worker } });
  });
  await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
    await route.fulfill({ json: { slots: [] } });
  });

  await page.goto("/en");
  await page.getByLabel("Location").fill("Atomic clinic");
  await page.getByRole("button", { name: "Save availability" }).click();

  await expect.poll(() => settingsRequests.length).toBe(1);
  expect(settingsRequests[0]).toMatchObject({
    location: "Atomic clinic",
    windows: expect.arrayContaining([
      expect.objectContaining({
        active: true,
        endMinute: 960,
        startMinute: 540,
        weekday: 1,
      }),
    ]),
  });
  expect(splitProfileRequest).toBe(false);
  expect(splitAvailabilityRequest).toBe(false);
});

test.describe("local timezone booking window", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("uses local tomorrow as the first selectable calendar date", async ({ page }) => {
    const service = {
      active: true,
      description: { en: null, fi: null },
      id: "service-local-time",
      name: { en: "Local time service", fi: "Paikallinen palvelu" },
    };

    await page.clock.setFixedTime(new Date("2026-05-05T03:30:00.000Z"));
    await page.route("http://localhost:4000/auth/me", async (route) => {
      await route.fulfill({ json: { user: null } });
    });
    await page.route("http://localhost:4000/services", async (route) => {
      await route.fulfill({ json: { services: [service] } });
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
              name: "Dr. Local Time",
              services: [service],
              timezone: "America/Los_Angeles",
              title: "General practitioner",
            },
          ],
        },
      });
    });
    await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
      await route.fulfill({ json: { slots: [] } });
    });

    await page.goto("/en");

    await expect(page.getByTestId("calendar-date-2026-05-04")).toBeDisabled();
    await expect(page.getByTestId("calendar-date-2026-05-05")).toBeEnabled();
    await expect(page.getByTestId("calendar-date-2026-05-05")).toHaveAttribute(
      "aria-current",
      "date",
    );
  });

  test("aligns slot fetch window to worker-local day boundaries", async ({ page }) => {
    const service = {
      active: true,
      description: { en: null, fi: null },
      id: "service-worker-boundary",
      name: { en: "Boundary service", fi: "Rajapalvelu" },
    };
    const slotRequests: URL[] = [];

    await page.clock.setFixedTime(new Date("2026-05-05T03:30:00.000Z"));
    await page.route("http://localhost:4000/auth/me", async (route) => {
      await route.fulfill({ json: { user: null } });
    });
    await page.route("http://localhost:4000/services", async (route) => {
      await route.fulfill({ json: { services: [service] } });
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
              name: "Dr. Worker Boundary",
              services: [service],
              timezone: "America/Los_Angeles",
              title: "General practitioner",
            },
          ],
        },
      });
    });
    await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
      slotRequests.push(new URL(route.request().url()));
      await route.fulfill({ json: { slots: [] } });
    });

    await page.goto("/en");

    await expect
      .poll(() => slotRequests[0]?.searchParams.get("from"))
      .toBe("2026-05-05T07:00:00.000Z");
    expect(slotRequests[0]?.searchParams.get("to")).toBe("2026-05-19T07:00:00.000Z");
  });
});
