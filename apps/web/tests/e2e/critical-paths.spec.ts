import { expect, type Page, test, type TestInfo } from "@playwright/test";

const e2ePassword = "E2ePassword123!";

function labelFromProjectName(projectName: string) {
  return projectName
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function workerName(testInfo: TestInfo) {
  return `Dr. E2E ${labelFromProjectName(testInfo.project.name)}`;
}

function workerEmail(testInfo: TestInfo) {
  return `e2e.worker.${testInfo.project.name}@example.com`;
}

async function signInFromDialog(page: Page, email: string) {
  const authDialog = page.getByRole("dialog", {
    name: /Account|Sign in or create an account to book this time/,
  });
  await expect(authDialog).toBeVisible();
  await authDialog.getByLabel("Email").fill(email);
  await authDialog.getByLabel("Password").fill(e2ePassword);
  await authDialog.getByRole("button", { name: "Sign in" }).click();
}

test("patient can find, book, and view an appointment", async ({ page }, testInfo) => {
  const selectedWorkerName = workerName(testInfo);

  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Healthcare appointments" })).toBeVisible();

  const workerSelect = page.getByLabel("Healthcare worker");
  await expect(workerSelect).toContainText(selectedWorkerName);
  await workerSelect.selectOption({ label: `${selectedWorkerName} · General practitioner` });
  await page.getByLabel("Service").selectOption({ label: "E2E General practice" });

  const bookButton = page.getByRole("button", { name: "Book" }).first();
  await expect(bookButton).toBeVisible();
  await bookButton.click();

  await signInFromDialog(page, "e2e.patient@example.com");

  const confirmDialog = page.getByRole("dialog", { name: "Confirm appointment" });
  await expect(confirmDialog).toContainText(selectedWorkerName);
  await confirmDialog.getByRole("button", { name: "Confirm booking" }).click();

  const bookedDialog = page.getByRole("dialog", { name: "Appointment booked" });
  await expect(bookedDialog).toBeVisible();
  await expect(bookedDialog).toContainText(selectedWorkerName);
  await expect(bookedDialog.getByRole("link", { name: "Add to calendar" })).toBeVisible();
  await bookedDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("tab", { name: /My appointments/ }).click();
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  const bookedAppointment = page
    .locator('[data-testid^="appointment-card-"]')
    .filter({ hasText: selectedWorkerName })
    .filter({ hasText: "E2E General practice" })
    .filter({ hasText: "Confirmed" })
    .first();
  await expect(bookedAppointment).toContainText(
    `E2E Clinic ${labelFromProjectName(testInfo.project.name)}`,
  );
});

test("worker can manage agenda appointments and block time", async ({ page }, testInfo) => {
  const projectName = testInfo.project.name;
  const selectedWorkerName = workerName(testInfo);
  const blockReason = `E2E admin block ${projectName}`;

  await page.goto("/en");
  await page.getByRole("button", { name: "Log in" }).click();
  await signInFromDialog(page, workerEmail(testInfo));

  await expect(page.getByRole("tab", { name: /Today's agenda/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today's agenda" })).toBeVisible();
  await expect(page.getByText(selectedWorkerName)).toBeVisible();

  const currentAppointment = page.getByTestId(`worker-appointment-e2e-${projectName}-current`);
  await expect(currentAppointment).toContainText("E2E Patient");
  await expect(currentAppointment).toContainText("E2E General practice");
  await currentAppointment.getByRole("button", { name: "Mark done" }).click();
  await page
    .getByRole("dialog", { name: "Mark appointment done?" })
    .getByRole("button", { name: "Mark done" })
    .click();
  await expect(currentAppointment).toContainText("Completed");

  const cancelAppointment = page.getByTestId(`worker-appointment-e2e-${projectName}-cancel`);
  await expect(cancelAppointment).toContainText("E2E Patient");
  await cancelAppointment.getByRole("button", { name: "Cancel" }).click();
  await page
    .getByRole("dialog", { name: "Cancel appointment?" })
    .getByRole("button", { name: "Cancel appointment" })
    .click();
  await expect(cancelAppointment).toContainText("Canceled");

  await page.getByRole("button", { name: "Block time" }).click();
  const blockDialog = page.getByRole("dialog", { name: "Block time" });
  await blockDialog.getByLabel("From").fill("13:15");
  await blockDialog.getByLabel("To").fill("13:45");
  await blockDialog.getByLabel("Reason").fill(blockReason);
  await blockDialog.getByRole("button", { name: "Save block" }).click();

  await expect(page.getByText(blockReason)).toBeVisible();
});
