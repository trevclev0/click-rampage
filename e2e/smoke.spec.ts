import { expect, test } from "@playwright/test";

test.describe("@smoke", () => {
  test("home page loads and reaches the API", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Click Rampage" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText("API ok");
  });

  test("home page joins the room over a WebSocket", async ({ page }) => {
    await page.goto("/");

    // Exact match on the status cell, so "connecting" or "disconnected"
    // never count.
    await expect(
      page
        .getByLabel("Room connection")
        .getByText("connected", { exact: true }),
    ).toBeVisible();
  });

  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
