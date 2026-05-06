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
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto("/fi");
  await expect(page.getByRole("heading", { name: "Terveydenhuollon ajanvaraus" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fi");
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
      location: "East clinic",
      patient,
      service,
      startsAt: "2026-05-07T06:00:00.000Z",
      status: "CONFIRMED",
      worker,
    },
    {
      endsAt: "2026-05-20T07:00:00.000Z",
      id: "appointment-two",
      location: null,
      patient,
      service,
      startsAt: "2026-05-20T06:30:00.000Z",
      status: "CONFIRMED",
      worker,
    },
    {
      endsAt: "2026-04-03T07:30:00.000Z",
      id: "appointment-past",
      location: "Archive clinic",
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
  await expect(bookTab).toHaveAttribute("tabindex", "0");
  await expect(appointmentsTab).toBeVisible();
  await expect(appointmentsTab).toHaveAttribute("tabindex", "-1");

  await bookTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(appointmentsTab).toBeFocused();
  await expect(appointmentsTab).toHaveAttribute("aria-selected", "true");
  await expect(appointmentsTab).toHaveAttribute("tabindex", "0");
  await expect(bookTab).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowLeft");
  await expect(bookTab).toBeFocused();
  await expect(bookTab).toHaveAttribute("aria-selected", "true");
  await expect(bookTab).toHaveAttribute("tabindex", "0");
  await expect(appointmentsTab).toHaveAttribute("tabindex", "-1");

  await appointmentsTab.click();
  await expect(appointmentsTab).toHaveAttribute("aria-selected", "true");
  await expect(appointmentsTab).toHaveAttribute("tabindex", "0");
  await expect(bookTab).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-one")).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-one")).toContainText("East clinic");
  await expect(page.getByTestId("appointment-card-appointment-two")).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-two")).toContainText("Main clinic");
  await expect(page.getByRole("heading", { name: "Past" })).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-past")).toBeVisible();
  await expect(page.getByTestId("appointment-card-appointment-past")).toContainText(
    "Archive clinic",
  );
  await expect(page.getByText("Select a date. Dots show availability.")).toHaveCount(0);

  await bookTab.click();
  await expect(page.getByRole("button", { name: /Next appointment.*East clinic/ })).toBeVisible();
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
    bufferMinutes: 0,
    bookingWindowDays: 90,
    id: "worker-one",
    location: "Original clinic",
    minimumNoticeMinutes: 0,
    name: "Dr. Atomic Settings",
    services: [service],
    timezone: "Europe/Helsinki",
    title: "General practitioner",
  };
  const settingsRequests: Array<{
    appointmentDurationMinutes?: number;
    bookingWindowDays?: number;
    bufferMinutes?: number;
    location?: string;
    minimumNoticeMinutes?: number;
    windows?: Array<{
      active: boolean;
      endMinute: number;
      location: string;
      startMinute: number;
      weekday: number;
    }>;
  }> = [];
  const windows = [
    {
      active: true,
      endMinute: 960,
      id: "window-one",
      location: "Original clinic",
      startMinute: 540,
      weekday: 1,
    },
  ];
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
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { timeOff: [], windows, worker } });
      return;
    }
    settingsRequests.push(route.request().postDataJSON() as (typeof settingsRequests)[number]);
    await route.fulfill({ json: { timeOff: [], windows, worker } });
  });
  await page.route(/http:\/\/localhost:4000\/workers\/worker-one\/slots.*/, async (route) => {
    await route.fulfill({ json: { slots: [] } });
  });

  await page.goto("/en");
  await expect(page.getByRole("tab", { name: /Today's agenda/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Book an appointment" })).toHaveCount(0);
  await page.getByRole("tab", { name: "My schedule" }).click();
  await expect(page.getByRole("textbox", { name: "From" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "To" })).toHaveValue("");
  await page.getByLabel("Location").first().fill("Atomic clinic");
  await page.getByRole("button", { name: "Save availability" }).click();

  await expect.poll(() => settingsRequests.length).toBe(1);
  expect(settingsRequests[0]).toMatchObject({
    appointmentDurationMinutes: 30,
    bookingWindowDays: 90,
    bufferMinutes: 0,
    location: "Atomic clinic",
    minimumNoticeMinutes: 0,
  });
  expect(settingsRequests[0]?.windows).toEqual([
    {
      active: true,
      endMinute: 960,
      location: "Atomic clinic",
      startMinute: 540,
      weekday: 1,
    },
  ]);
  expect(splitProfileRequest).toBe(false);
  expect(splitAvailabilityRequest).toBe(false);
});

test("worker agenda shows patient details, status actions, and block time", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "chromium") {
    await page.setViewportSize({ height: 900, width: 1800 });
  }

  await page.clock.setFixedTime(new Date("2026-05-04T08:00:00.000Z"));

  const service = {
    active: true,
    description: { en: null, fi: null },
    id: "service-worker-agenda",
    name: { en: "General practice", fi: "Yleislääkäri" },
  };
  const worker = {
    active: true,
    appointmentDurationMinutes: 15,
    bufferMinutes: 10,
    bookingWindowDays: 14,
    id: "worker-one",
    location: "Main clinic",
    minimumNoticeMinutes: 120,
    name: "Dr. Worker Agenda",
    services: [service],
    timezone: "Europe/Helsinki",
    title: "General practitioner",
  };
  const patient = {
    email: "matti@example.com",
    id: "patient-one",
    name: "Matti Virtanen",
    phone: "+358 40 123 4567",
    preferredLocale: "en",
    role: "PATIENT",
    workerProfile: null,
  };
  const workerUser = {
    email: "worker@example.com",
    id: "worker-user",
    name: "Dr. Worker Agenda",
    phone: null,
    preferredLocale: "en",
    role: "WORKER",
    workerProfile: worker,
  };
  const appointment = {
    endsAt: "2026-05-04T07:15:00.000Z",
    id: "appointment-one",
    location: "Main clinic",
    patient,
    service,
    startsAt: "2026-05-04T07:00:00.000Z",
    status: "CONFIRMED",
    worker,
  };
  const longWeekAppointment = {
    endsAt: "2026-05-07T06:15:00.000Z",
    id: "appointment-long-week",
    location: "Kamppi Health Clinic, Helsinki",
    patient: {
      ...patient,
      email: "patient.with.a.long.email.address@example.com",
      id: "patient-long-week",
      name: "Patient User",
      phone: null,
    },
    service,
    startsAt: "2026-05-07T06:00:00.000Z",
    status: "CANCELED",
    worker,
  };
  let currentAppointments = [appointment, longWeekAppointment];
  let currentTimeOff: unknown[] = [];
  let statusRequest: Record<string, unknown> | null = null;
  let blockRequest: Record<string, unknown> | null = null;

  await page.route("http://localhost:4000/auth/me", async (route) => {
    await route.fulfill({ json: { user: workerUser } });
  });
  await page.route("http://localhost:4000/appointments", async (route) => {
    await route.fulfill({ json: { appointments: currentAppointments } });
  });
  await page.route("http://localhost:4000/appointments/appointment-one/status", async (route) => {
    statusRequest = route.request().postDataJSON() as Record<string, unknown>;
    currentAppointments = currentAppointments.map((currentAppointment) =>
      currentAppointment.id === appointment.id
        ? { ...currentAppointment, status: "COMPLETED" }
        : currentAppointment,
    );
    await route.fulfill({ json: { appointment: currentAppointments[0] } });
  });
  await page.route("http://localhost:4000/services", async (route) => {
    await route.fulfill({ json: { services: [service] } });
  });
  await page.route("http://localhost:4000/workers", async (route) => {
    await route.fulfill({ json: { workers: [worker] } });
  });
  await page.route("http://localhost:4000/worker/settings", async (route) => {
    await route.fulfill({
      json: {
        timeOff: currentTimeOff,
        windows: [
          {
            active: true,
            endMinute: 960,
            id: "window-one",
            location: "Main clinic",
            startMinute: 540,
            weekday: 1,
          },
        ],
        worker,
      },
    });
  });
  await page.route("http://localhost:4000/worker/time-off", async (route) => {
    blockRequest = route.request().postDataJSON() as Record<string, unknown>;
    currentTimeOff = [
      {
        endsAt: blockRequest.endsAt,
        id: "time-off-one",
        reason: blockRequest.reason,
        startsAt: blockRequest.startsAt,
      },
    ];
    await route.fulfill({ json: { timeOff: currentTimeOff[0] } });
  });

  await page.goto("/en");

  await expect(page.getByRole("tab", { name: /Today's agenda/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "Book an appointment" })).toHaveCount(0);
  await expect(page.getByText("Matti Virtanen")).toBeVisible();
  await expect(page.getByText("+358 40 123 4567")).toBeVisible();

  await page.getByRole("button", { name: "Mark done" }).click();
  await expect.poll(() => statusRequest?.status).toBe("COMPLETED");
  await expect(page.getByTestId("worker-appointment-appointment-one")).toContainText("Completed");

  await page.getByRole("tab", { name: "Week view" }).click();
  await expect(page.getByRole("button", { name: /Block time on/ }).first()).toContainText(
    "Block time",
  );
  const weekLayout = await page
    .locator('[data-testid^="worker-appointment-"]')
    .evaluateAll((cards) => {
      const cardsContained = cards.every((card) => {
        const day = card.closest("section");
        if (!day) return false;

        const cardRect = card.getBoundingClientRect();
        const dayRect = day.getBoundingClientRect();
        return cardRect.left >= dayRect.left - 1 && cardRect.right <= dayRect.right + 1;
      });

      return {
        cardCount: cards.length,
        cardsContained,
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    });
  expect(weekLayout).toEqual({ cardCount: 2, cardsContained: true, pageFits: true });

  await page.getByRole("button", { name: "Block time", exact: true }).click();
  await page.getByLabel("Reason").fill("Admin time");
  await page.getByRole("button", { name: "Save block" }).click();

  await expect.poll(() => blockRequest?.reason).toBe("Admin time");
  await expect(page.getByText("Admin time")).toBeVisible();
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
    location: "East clinic",
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
            location: "Booked clinic",
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
  await expect(page.getByRole("dialog")).toContainText("East clinic");
  await page.locator("select").nth(1).selectOption(secondService.id, { force: true });
  await expect(page.locator("select").nth(1)).toHaveValue(secondService.id);
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect.poll(() => appointmentRequest?.serviceId).toBe(firstService.id);
  await expect(page.getByText("Booked clinic")).toBeVisible();
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
