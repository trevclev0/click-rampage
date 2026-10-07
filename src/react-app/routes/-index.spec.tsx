import {
  createTestRouter,
  renderWithRouter,
} from "@test-utils/reactRouterUtils";
import { joinRoom, makePlayer } from "@test-utils/roomTestUtils";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// Files prefixed with "-" are ignored by TanStack Router's file-based routing.
describe("/ route", () => {
  it("renders the home page with the API status", async () => {
    renderWithRouter(createTestRouter("/"));

    expect(
      await screen.findByRole("heading", { name: "Get ready to rampage" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("test")).toBeInTheDocument();
  });

  it("lets you click once the room connects", async () => {
    renderWithRouter(createTestRouter("/"));
    const button = await screen.findByRole("button", { name: "Click!" });
    expect(button).toBeDisabled();

    joinRoom(makePlayer({ count: 3 }));

    expect(button).toBeEnabled();
    expect(
      screen.getByRole("status", { name: "Your clicks" }),
    ).toHaveTextContent("3 clicks");
  });
});
