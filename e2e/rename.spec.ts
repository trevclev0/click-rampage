import { expect, test } from "@playwright/test";

test("rename yourself using only the keyboard", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Change name" });
  const dialog = page.getByRole("dialog", { name: "Change your name" });
  const input = page.getByLabel("Name", { exact: true });
  await expect(trigger).toBeEnabled();

  // The current name is selected on open, so typing replaces it.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.type("Keyboard Kid");
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Playing as Keyboard Kid")).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ has: page.getByText("You", { exact: true }) }),
  ).toContainText("Keyboard Kid");

  // Escape closes without saving and returns focus to the trigger.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Never Saved");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("Playing as Keyboard Kid")).toBeVisible();
});
