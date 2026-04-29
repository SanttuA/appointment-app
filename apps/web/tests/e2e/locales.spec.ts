import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
