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

test("patients can reach appointments from tabs and the next appointment banner", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-05-04T08:00:00.000Z"));

  const service = {
    active: true,
    description: { en: null, fi: null },
    id: "service-general",
    name: { en: "General practice", fi: "Yleislääkäri" },
  };
  const worker = {
    active: true,
    appointmentDurationMinutes: 30,
    id: "worker-one",
    location: "Main clinic",
    name: "Dr. Aino Lehto",
    services: [service],
    timezone: "Europe/Helsinki",
    title: "General practitioner",
  };
  const patient = {
    email: "patient@example.com",
    id: "patient-user",
    name: "Patient User",
    phone: null,
    preferredLocale: "en",
    role: "PATIENT",
    workerProfile: null,
  };
  const appointments = [
    {
      endsAt: "2026-05-07T06:30:00.000Z",
      id: "appointment-one",
      patient,
      service,
      startsAt: "2026-05-07T06:00:00.000Z",
      status: "CONFIRMED",
      worker,
    },
    {
      endsAt: "2026-05-20T07:00:00.000Z",
      id: "appointment-two",
      patient,
      service,
      startsAt: "2026-05-20T06:30:00.000Z",
      status: "CONFIRMED",
      worker,
    },
    {
      endsAt: "2026-04-03T07:30:00.000Z",
      id: "appointment-past",
      patient,
      service,
      startsAt: "2026-04-03T07:00:00.000Z",
      status: "COMPLETED",
      worker,
    },
  ];

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({ json: { user: patient } });
  });
  await page.route("http://localhost:4000/appointments", async (route) => {
    await route.fulfill({ json: { appointments } });
  });
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [service] } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({ json: { workers: [worker] } });
  });
  await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
    await route.fulfill({ json: { slots: [] } });
  });

  await page.goto("/en");

  const bookTab = page.getByRole("tab", { name: "Book an appointment" });
  const appointmentsTab = page.getByRole("tab", { name: /My appointments.*2/ });
  await expect(bookTab).toHaveAttribute("aria-selected", "true");
  await expect(appointmentsTab).toBeVisible();

  await appointmentsTab.click();
  await expect(appointmentsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-one")).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-two")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Past" })).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-past")).toBeVisible();
  await expect(page.getByText("Select a date. Dots show availability.")).toHaveCount(0);

  await bookTab.click();
  await page.getByRole("button", { name: /Next appointment/ }).click();
  await expect(appointmentsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("appointment-card-appointment-one")).toBeFocused();
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

test("booking confirmation uses the context captured when the dialog opened", async ({ page }) => {
  const tomorrow = inputDateFromToday(1);
  const firstService = {
    active: true,
    description: { en: null, fi: null },
    id: "service-original",
    name: { en: "Original service", fi: "Alkuperäinen palvelu" },
  };
  const secondService = {
    active: true,
    description: { en: null, fi: null },
    id: "service-changed",
    name: { en: "Changed service", fi: "Vaihdettu palvelu" },
  };
  const worker = {
    active: true,
    appointmentDurationMinutes: 30,
    id: "worker-one",
    location: "Main clinic",
    name: "Dr. Stable Context",
    services: [firstService, secondService],
    timezone: "Europe/Helsinki",
    title: "General practitioner",
  };
  const slot = {
    endsAt: `${tomorrow}T09:30:00.000Z`,
    startsAt: `${tomorrow}T09:00:00.000Z`,
    status: "AVAILABLE",
  };
  let appointmentRequest: Record<string, unknown> | null = null;

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({
      json: {
        user: {
          email: "patient@example.com",
          id: "patient-user",
          name: "Patient User",
          phone: null,
          preferredLocale: "en",
          role: "PATIENT",
          workerProfile: null,
        },
      },
    });
  });
  await page.route("http://localhost:4000/appointments", async (route) => {
    if (route.request().method() === "POST") {
      appointmentRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          appointment: {
            cancellationReason: null,
            canceledAt: null,
            endsAt: slot.endsAt,
            id: "appointment-one",
            patient: {
              email: "patient@example.com",
              id: "patient-user",
              name: "Patient User",
              phone: null,
              preferredLocale: "en",
            },
            service: firstService,
            startsAt: slot.startsAt,
            status: "CONFIRMED",
            worker,
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { appointments: [] } });
  });
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [firstService, secondService] } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({ json: { workers: [worker] } });
  });
  await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
    const url = new URL(route.request().url());
    const serviceId = url.searchParams.get("serviceId");
    await route.fulfill({ json: { slots: serviceId === firstService.id ? [slot] : [] } });
  });

  await page.goto("/en");
  await page.getByRole("button", { name: "Book" }).click();
  await page.locator("select").nth(1).selectOption(secondService.id, { force: true });
  await expect(page.locator("select").nth(1)).toHaveValue(secondService.id);
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect.poll(() => appointmentRequest?.serviceId).toBe(firstService.id);
  expect(appointmentRequest).toMatchObject({
    serviceId: firstService.id,
    startsAt: slot.startsAt,
    workerProfileId: worker.id,
  });
});

test("rescheduling updates the existing appointment instead of creating a new one", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-05-04T08:00:00.000Z"));

  const service = {
    active: true,
    description: { en: null, fi: null },
    id: "service-general",
    name: { en: "General practice", fi: "Yleislääkäri" },
  };
  const worker = {
    active: true,
    appointmentDurationMinutes: 30,
    id: "worker-one",
    location: "Main clinic",
    name: "Dr. Aino Lehto",
    services: [service],
    timezone: "Europe/Helsinki",
    title: "General practitioner",
  };
  const patient = {
    email: "patient@example.com",
    id: "patient-user",
    name: "Patient User",
    phone: null,
    preferredLocale: "en",
    role: "PATIENT",
    workerProfile: null,
  };
  const newSlot = {
    endsAt: "2026-05-07T07:30:00.000Z",
    startsAt: "2026-05-07T07:00:00.000Z",
    status: "AVAILABLE",
  };
  const originalAppointment = {
    endsAt: "2026-05-07T06:30:00.000Z",
    id: "appointment-one",
    patient,
    service,
    startsAt: "2026-05-07T06:00:00.000Z",
    status: "CONFIRMED",
    worker,
  };
  const updatedAppointment = {
    ...originalAppointment,
    endsAt: newSlot.endsAt,
    startsAt: newSlot.startsAt,
  };
  let currentAppointments = [originalAppointment];
  let appointmentRequest: Record<string, unknown> | null = null;
  let createRequestSent = false;

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({ json: { user: patient } });
  });
  await page.route("http://localhost:4000/appointments", async (route) => {
    if (route.request().method() === "POST") {
      createRequestSent = true;
      await route.fulfill({ status: 500, json: { error: { code: "UNEXPECTED_POST" } } });
      return;
    }
    await route.fulfill({ json: { appointments: currentAppointments } });
  });
  await page.route(
    "http://localhost:4000/appointments/appointment-one/reschedule",
    async (route) => {
      appointmentRequest = route.request().postDataJSON() as Record<string, unknown>;
      currentAppointments = [updatedAppointment];
      await route.fulfill({ json: { appointment: updatedAppointment } });
    },
  );
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [service] } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({ json: { workers: [worker] } });
  });
  await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
    await route.fulfill({ json: { slots: [newSlot] } });
  });

  await page.goto("/en");
  await page.getByRole("tab", { name: /My appointments/ }).click();
  await page.getByRole("button", { name: "Reschedule" }).click();

  await expect(page.getByRole("tab", { name: "Book an appointment" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("select").first()).toHaveValue(worker.id);
  await expect(page.locator("select").nth(1)).toHaveValue(service.id);

  await page.getByRole("button", { name: /^Reschedule$/ }).click();
  await expect(page.getByRole("heading", { name: "Confirm reschedule" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm reschedule" }).click();

  await expect.poll(() => appointmentRequest?.startsAt).toBe(newSlot.startsAt);
  expect(createRequestSent).toBe(false);
  await expect(page.getByRole("tab", { name: /My appointments/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("appointment-card-appointment-one")).toContainText("10:00 AM");
  await expect(page.getByTestId("appointment-card-appointment-one")).toBeFocused();
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
