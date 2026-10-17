import { expect, type Page, test } from "@playwright/test";

// The API status and the Connection card sit in a collapsed disclosure.
const openConnectionDetails = (page: Page) =>
  page.getByText("Connection details", { exact: true }).click();

test.describe("@smoke", () => {
  test("home page loads and reaches the API", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "Click Rampage" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Get ready to rampage" }),
    ).toBeVisible();
    await openConnectionDetails(page);
    await expect(
      page.getByRole("status").filter({ hasText: "API" }),
    ).toContainText("API ok");
  });

  test("home page joins the room over a WebSocket", async ({ page }) => {
    await page.goto("/");
    await openConnectionDetails(page);

    // Exact match on the status, so "Connecting…" or "Disconnected" never
    // count.
    await expect(
      page
        .getByRole("region", { name: "Connection" })
        .getByText("Connected", { exact: true }),
    ).toBeVisible();
  });

  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
