import {
  createTestRouter,
  renderWithRouter,
} from "@test-utils/reactRouterUtils";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Files prefixed with "-" are ignored by TanStack Router's file-based routing.
describe("/ route", () => {
  it("renders the home page with the API status", async () => {
    renderWithRouter(createTestRouter("/"));

    expect(
      await screen.findByRole("heading", { name: "cf-starter" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("test")).toBeInTheDocument();
  });
});
