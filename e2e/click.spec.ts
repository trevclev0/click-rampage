import { expect, test } from "@playwright/test";

// Each test gets a fresh browser context, so a fresh player starting at 0.
test("clicking the button bumps your count", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Click!" });
  const count = page.getByRole("status", { name: "Your clicks" });

  await expect(button).toBeEnabled();
  await expect(count).toHaveText("0 clicks");

  await button.click();
  await expect(count).toHaveText("1 click");

  await button.click();
  await expect(count).toHaveText("2 clicks");

  // Your card in the online grid follows along.
  const yourCard = page
    .getByRole("listitem")
    .filter({ has: page.getByText("You", { exact: true }) });
  await expect(yourCard).toContainText("2 clicks");
});
