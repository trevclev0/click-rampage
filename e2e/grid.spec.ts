import { expect, test } from "@playwright/test";

// Previews share one global room with other running tests, so the long
// name carries a random suffix to find its card by.
const longName = () =>
  `${"W".repeat(14)}${Math.random().toString(36).slice(2, 8)}`;

test("another player's long name never makes a phone scroll sideways", async ({
  browser,
}) => {
  const viewer = await browser.newContext({
    viewport: { width: 320, height: 800 },
  });
  const page = await viewer.newPage();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Click!" })).toBeEnabled();

  // Any client can rename over the protocol; this one picks the widest
  // name the server accepts (20 visible characters).
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByRole("button", { name: "Click!" })).toBeEnabled();
  const name = longName();
  await otherPage.evaluate(
    (newName) =>
      new Promise<void>((resolve) => {
        const url = `${location.origin.replace("http", "ws")}/api/ws`;
        const socket = new WebSocket(url);
        socket.onopen = () => {
          socket.send(JSON.stringify({ type: "rename", name: newName }));
          socket.close();
          resolve();
        };
      }),
    name,
  );

  const nameText = page.getByRole("listitem").getByText(name, { exact: true });
  await expect(nameText).toBeVisible();

  const layout = await nameText.evaluate((element) => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    truncated: element.scrollWidth > element.clientWidth,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.truncated).toBe(true);

  await other.close();
  await viewer.close();
});
