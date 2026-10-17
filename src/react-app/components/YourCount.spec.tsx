import {
  joinRoom,
  makePlayer,
  receive,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { YourCount } from "./YourCount";

const you = makePlayer({ count: 41 });
const other = makePlayer({ id: "b".repeat(32), count: 7 });
const readout = () => screen.getByRole("status", { name: "Your clicks" });

describe("YourCount", () => {
  it("shows a placeholder before the room welcomes you", () => {
    renderWithRoom(<YourCount />);
    expect(readout()).toHaveTextContent("— clicks");
  });

  it("shows your count from the welcome", () => {
    renderWithRoom(<YourCount />);
    joinRoom(you, [you, other]);
    expect(readout()).toHaveTextContent("41 clicks");
  });

  it("follows count broadcasts for you, not for others", () => {
    renderWithRoom(<YourCount />);
    joinRoom(you, [you, other]);

    receive({ type: "count", id: other.id, count: 8 });
    expect(readout()).toHaveTextContent("41 clicks");

    receive({ type: "count", id: you.id, count: 42 });
    expect(readout()).toHaveTextContent("42 clicks");
  });

  it("remounts the number on each change so the bounce replays", () => {
    renderWithRoom(<YourCount />);
    joinRoom(you);
    const before = screen.getByText("41");

    receive({ type: "count", id: you.id, count: 42 });

    expect(before).not.toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("uses the singular for one click", () => {
    renderWithRoom(<YourCount />);
    joinRoom(makePlayer({ count: 1 }));
    expect(readout()).toHaveTextContent("1 click");
  });
});
