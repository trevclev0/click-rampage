import { expect, test } from "@playwright/test";

test("connection details start collapsed and open from the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  const summary = page.getByText("Connection details", { exact: true });
  const details = page.locator("details").filter({ has: summary });
  const card = page.getByRole("region", { name: "Connection" });

  await expect(details).not.toHaveAttribute("open");
  await expect(card).toBeHidden();

  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open");
  await expect(card).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(details).not.toHaveAttribute("open");
  await expect(card).toBeHidden();

  await page.keyboard.press("Space");
  await expect(details).toHaveAttribute("open");
  await expect(card).toBeVisible();
});

test("connection changes are announced while collapsed", async ({ page }) => {
  await page.goto("/");
  const live = page.getByRole("switch", { name: "Live" });
  // The Live switch only shows the connection visually, and closed details
  // hide the card from screen readers, so a hidden status line speaks up.
  const announcer = page
    .getByRole("status")
    .filter({ hasText: /^(Connecting…|Connected|Disconnected)$/ });

  await expect(page.getByRole("region", { name: "Connection" })).toBeHidden();
  await expect(announcer).toHaveText("Connected");
  // In the accessibility tree, but not drawn.
  expect((await announcer.boundingBox())?.width).toBeLessThanOrEqual(1);

  await live.click();
  await expect(announcer).toHaveText("Disconnected");

  await live.click();
  await expect(announcer).toHaveText("Connected");
});

test("going offline and back keeps your count", async ({ page }) => {
  await page.goto("/");
  const click = page.getByRole("button", { name: "Click!" });
  const live = page.getByRole("switch", { name: "Live" });
  const count = page.getByRole("status", { name: "Your clicks" });
  const card = page.getByRole("region", { name: "Connection" });

  await page.getByText("Connection details", { exact: true }).click();
  await expect(click).toBeEnabled();
  await click.click();
  await expect(count).toHaveText("1 click");
  // The ping sent on open reports a latency.
  await expect(card).toContainText(/\d+ ms/);

  await live.click();
  await expect(live).not.toBeChecked();
  await expect(card.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(click).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Change name" }),
  ).toBeDisabled();

  // Reconnecting comes back as the same player, so the count survives.
  await live.click();
  await expect(card.getByText("Connected", { exact: true })).toBeVisible();
  await expect(click).toBeEnabled();
  await expect(count).toHaveText("1 click");
});
