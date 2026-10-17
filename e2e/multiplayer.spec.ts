import { type Browser, expect, type Page, test } from "@playwright/test";

// Previews share one global room with every other test running against
// them, so each player gets a unique name to find their card by.
const uniqueName = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

async function join(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Click!" })).toBeEnabled();
  return { context, page };
}

async function rename(page: Page, name: string) {
  await page.getByRole("button", { name: "Change name" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`Playing as ${name}`)).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name });

test("two players see each other's clicks, renames and leaving", async ({
  browser,
}) => {
  const alice = await join(browser);
  const bob = await join(browser);
  const aliceName = uniqueName("Alice");
  const bobName = uniqueName("Bob");

  // A rename in one browser shows up in the other.
  await rename(alice.page, aliceName);
  await rename(bob.page, bobName);
  await expect(card(bob.page, aliceName)).toBeVisible();
  await expect(card(alice.page, bobName)).toBeVisible();

  // Clicking in one browser moves the count in the other.
  const click = alice.page.getByRole("button", { name: "Click!" });
  for (let i = 0; i < 3; i++) await click.click();
  await expect(card(bob.page, aliceName)).toContainText("3 clicks");

  // Closing one browser removes that player from the other's grid.
  await alice.context.close();
  await expect(card(bob.page, aliceName)).toHaveCount(0);
  await expect(card(bob.page, bobName)).toBeVisible();

  await bob.context.close();
});
