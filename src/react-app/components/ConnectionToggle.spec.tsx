import { MockWebSocket } from "@test-utils/mockWebSocket";
import {
  joinRoom,
  makePlayer,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConnectionToggle } from "./ConnectionToggle";

const toggle = () => screen.getByRole("switch", { name: "Live" });

describe("ConnectionToggle", () => {
  it("is on while you want to be connected, and reflects the status", () => {
    renderWithRoom(<ConnectionToggle />);
    expect(toggle()).toBeChecked();
    expect(toggle()).toHaveAttribute("data-status", "connecting");

    joinRoom(makePlayer());
    expect(toggle()).toHaveAttribute("data-status", "connected");
  });

  it("disconnects, then reconnects with a fresh socket", async () => {
    const user = userEvent.setup();
    renderWithRoom(<ConnectionToggle />);
    const socket = joinRoom(makePlayer());

    await user.click(toggle());
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toHaveAttribute("data-status", "disconnected");
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);

    await user.click(toggle());
    expect(toggle()).toBeChecked();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.latest()).not.toBe(socket);
  });
});
