import {
  joinRoom,
  makePlayer,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomDebug } from "./RoomDebug";

describe("RoomDebug", () => {
  it("shows the live connection state", () => {
    renderWithRoom(<RoomDebug />);
    const readout = screen.getByLabelText("Room connection");
    expect(readout).toHaveTextContent("connecting");

    joinRoom(makePlayer({ name: "Rage", count: 9 }));

    expect(within(readout).getByText("connected")).toBeInTheDocument();
    expect(within(readout).getByText("Rage (9)")).toBeInTheDocument();
  });
});
