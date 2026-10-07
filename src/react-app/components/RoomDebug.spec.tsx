import { MockWebSocket } from "@test-utils/mockWebSocket";
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomDebug } from "./RoomDebug";

describe("RoomDebug", () => {
  it("shows the live connection state", () => {
    render(<RoomDebug />);
    const readout = screen.getByLabelText("Room connection");
    expect(readout).toHaveTextContent("connecting");

    const you = { id: "a".repeat(32), name: "Rage", count: 9 };
    act(() => {
      MockWebSocket.latest().open();
      MockWebSocket.latest().receive({ type: "welcome", you, online: [you] });
    });

    expect(within(readout).getByText("connected")).toBeInTheDocument();
    expect(within(readout).getByText("Rage (9)")).toBeInTheDocument();
  });
});
