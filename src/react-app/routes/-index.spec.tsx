import {
  createTestRouter,
  renderWithRouter,
} from "@test-utils/reactRouterUtils";
import { joinRoom, makePlayer } from "@test-utils/roomTestUtils";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

// Files prefixed with "-" are ignored by TanStack Router's file-based routing.
describe("/ route", () => {
  it("renders the home page with the API status tucked away", async () => {
    renderWithRouter(createTestRouter("/"));

    expect(
      await screen.findByRole("heading", { name: "Get ready to rampage" }),
    ).toBeInTheDocument();
    // Collapsed, below the player grid.
    const players = screen.getByRole("heading", { name: /online$/ });
    const details = screen
      .getByText("Connection details")
      .closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(players.compareDocumentPosition(details)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(details).getByRole("region", { name: "Connection" }),
    ).toBeInTheDocument();
    expect(await within(details).findByText("test")).toBeInTheDocument();
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

  it("disables clicking and renaming after you go offline", async () => {
    const user = userEvent.setup();
    renderWithRouter(createTestRouter("/"));
    const click = await screen.findByRole("button", { name: "Click!" });
    const rename = screen.getByRole("button", { name: "Change name" });
    joinRoom(makePlayer());
    expect(click).toBeEnabled();
    expect(rename).toBeEnabled();

    await user.click(screen.getByRole("switch", { name: "Live" }));

    expect(click).toBeDisabled();
    expect(rename).toBeDisabled();
    expect(
      within(screen.getByRole("region", { name: "Connection" })).getByText(
        "Disconnected",
      ),
    ).toBeInTheDocument();
  });
});
