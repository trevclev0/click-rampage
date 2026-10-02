import { expect, test } from "@playwright/test";

test.describe("@smoke", () => {
  test("home page loads and reaches the API", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "Click Rampage" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Get ready to rampage" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText("API ok");
  });

  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});
