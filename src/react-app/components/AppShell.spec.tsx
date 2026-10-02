import {
  createTestRouter,
  renderWithRouter,
} from "@test-utils/reactRouterUtils";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("AppShell", () => {
  it("wraps every page in a header, main and footer", async () => {
    renderWithRouter(createTestRouter("/"));

    const brand = await screen.findByRole("link", { name: "Click Rampage" });
    expect(brand).toHaveAttribute("href", "/");
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("button", { name: /Switch to (dark|light) theme/ }),
    );
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "Get ready to rampage" }),
    );
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
