import { expect, test } from "@playwright/test";

test.use({ colorScheme: "light" });

test("theme choice survives a reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  // No saved choice: the OS preference applies and nothing is pinned.
  await expect(html).not.toHaveAttribute("data-theme");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
});
