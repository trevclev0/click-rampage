import { expect, test } from "@playwright/test";

test("your clicks put you on the all-time leaderboard", async ({ page }) => {
  // Previews share one global room with other runs, so the name carries a
  // random suffix to find this player's row by.
  const name = `Board ${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/");
  const board = page.getByRole("region", { name: "All-time leaderboard" });
  await expect(board.getByText(/Everyone together/)).toBeVisible();

  await page.getByRole("button", { name: "Change name" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Click!" }).click();

  // Whether in the top list or below it, your row is marked "You". The
  // Room pushes changes at most every 5 s, so allow a little longer.
  await expect(
    board
      .getByRole("listitem")
      .filter({ has: page.getByText("You", { exact: true }) }),
  ).toContainText(name, { timeout: 10_000 });
});

test("a long name on the board never makes a phone scroll sideways", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
  });
  const page = await context.newPage();
  // The widest name the server accepts (20 visible characters).
  const name = `${"W".repeat(14)}${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/");
  const board = page.getByRole("region", { name: "All-time leaderboard" });
  await expect(board.getByText(/Everyone together/)).toBeVisible();

  await page.getByRole("button", { name: "Change name" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Click!" }).click();

  const nameText = board.getByRole("listitem").getByText(name, { exact: true });
  await expect(nameText).toBeVisible({ timeout: 10_000 });

  const layout = await nameText.evaluate((element) => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    truncated: element.scrollWidth > element.clientWidth,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.truncated).toBe(true);

  await context.close();
});
