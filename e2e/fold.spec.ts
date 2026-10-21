import { expect, test } from "@playwright/test";

// Plain viewports rather than devices[...], which need WebKit (and Firefox
// has no isMobile), so these run in both the Chromium and Firefox
// projects. Headless Firefox draws a classic scrollbar, so it lays the
// page out a little narrower than the viewport, which Safari's overlay
// scrollbar does not.
const phones = [
  // An iPhone 13's visible viewport in Safari.
  { name: "a phone", viewport: { width: 390, height: 664 } },
  // An iPhone SE in Safari: wider than the 30rem phone breakpoint's
  // narrowest phones, but much shorter.
  { name: "a short phone", viewport: { width: 375, height: 548 } },
  // An iPhone 13 on its side, wider than the phone breakpoint.
  { name: "a phone in landscape", viewport: { width: 750, height: 340 } },
];

for (const { name, viewport } of phones) {
  test.describe(name, () => {
    test.use({ viewport });

    test("your count and the button fit above the fold", async ({ page }) => {
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
  });
}
