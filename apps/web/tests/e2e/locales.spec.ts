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
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth()
  );
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
  await expect(page.getByTestId(`strip-date-${farDate}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
