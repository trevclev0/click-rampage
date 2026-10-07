import { MockWebSocket } from "@test-utils/mockWebSocket";
import {
  joinRoom,
  makePlayer,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClickButton } from "./ClickButton";

const button = () => screen.getByRole("button", { name: "Click!" });

describe("ClickButton", () => {
  it("is disabled until the room welcomes you", () => {
    renderWithRoom(<ClickButton />);
    expect(button()).toBeDisabled();

    joinRoom(makePlayer());
    expect(button()).toBeEnabled();
  });

  it("sends one increment per click", async () => {
    const user = userEvent.setup();
    renderWithRoom(<ClickButton />);
    const socket = joinRoom(makePlayer());

    await user.click(button());
    await user.click(button());

    const increments = socket.sent.filter(
      (message) => (message as { type: string }).type === "increment",
    );
    expect(increments).toEqual([{ type: "increment" }, { type: "increment" }]);
  });

  it("is disabled again when the connection drops", () => {
    renderWithRoom(<ClickButton />);
    joinRoom(makePlayer());

    act(() => MockWebSocket.latest().drop());
    expect(button()).toBeDisabled();
  });
});
