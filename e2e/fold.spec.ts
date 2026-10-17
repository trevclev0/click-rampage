import { expect, test } from "@playwright/test";

// An iPhone 13's visible viewport in Safari. A plain viewport rather than
// devices["iPhone 13"], which needs WebKit (and Firefox has no isMobile),
// so this runs in both the Chromium and Firefox projects. Headless Firefox
// draws a classic scrollbar, so it lays the page out a little narrower
// than 390px, which Safari's overlay scrollbar does not.
test.use({ viewport: { width: 390, height: 664 } });

test("your count and the button fit above the fold on a phone", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Click!" });
  const count = page.getByRole("status", { name: "Your clicks" });

  // Wait for the room, so the layout is final before measuring.
  await expect(button).toBeEnabled();
  await expect(count).toHaveText("0 clicks");

  await expect(count).toBeInViewport({ ratio: 1 });
  await expect(button).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
