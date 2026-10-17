import { expect, test } from "@playwright/test";

// iPhone 13's viewport. Only the size: the device's `isMobile` flag isn't
// supported in Firefox, and the layout depends on width and height alone.
test.use({ viewport: { width: 390, height: 664 } });

test("your count and the whole Click button fit on a phone's first screen", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Click!" });
  await expect(button).toBeEnabled();

  await expect(
    page.getByRole("status", { name: "Your clicks" }),
  ).toBeInViewport({ ratio: 1 });
  await expect(button).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
