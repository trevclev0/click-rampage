import { MockWebSocket } from "@test-utils/mockWebSocket";
import {
  joinRoom,
  makePlayer,
  receive,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConnectionToggle } from "./ConnectionToggle";
import { PlayerGrid } from "./PlayerGrid";

const you = makePlayer({ name: "Me", count: 5 });
const ana = makePlayer({ id: "b".repeat(32), name: "Ana", count: 2 });
const bo = makePlayer({ id: "c".repeat(32), name: "Bo", count: 9 });

const heading = () => screen.getByRole("heading", { level: 2 });
const cards = () => screen.getAllByRole("listitem");
// Each card's name is the first paragraph inside it.
const names = () => cards().map((item) => item.querySelector("p")?.textContent);
const card = (name: string) =>
  cards().find((item) => within(item).queryByText(name)) as HTMLElement;

describe("PlayerGrid", () => {
  it("waits for the room before listing anyone", () => {
    renderWithRoom(<PlayerGrid />);

    expect(heading()).toHaveTextContent("0 players online");
    expect(screen.getByText("Waiting for the room…")).toBeInTheDocument();
  });

  it("lists everyone online with you first, then the highest counts", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you, [ana, you, bo]);

    expect(heading()).toHaveTextContent("3 players online");
    expect(names()).toEqual(["Me", "Bo", "Ana"]);
    expect(within(card("Me")).getByText("You")).toBeInTheDocument();
    expect(within(card("Ana")).queryByText("You")).not.toBeInTheDocument();
  });

  it("keeps you first even with the lowest count", () => {
    renderWithRoom(<PlayerGrid />);
    const behind = { ...you, count: 0 };
    joinRoom(behind, [ana, behind, bo]);

    expect(names()).toEqual(["Me", "Bo", "Ana"]);
  });

  it("keeps tied players in the order they joined", () => {
    renderWithRoom(<PlayerGrid />);
    const cy = makePlayer({ id: "d".repeat(32), name: "Cy", count: 2 });
    joinRoom(you, [you, cy, ana]);
    expect(names()).toEqual(["Me", "Cy", "Ana"]);

    receive({ type: "player_joined", player: { ...bo, count: 2 } });
    expect(names()).toEqual(["Me", "Cy", "Ana", "Bo"]);
  });

  it("reorders as counts change", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you, [you, bo, ana]);
    expect(names()).toEqual(["Me", "Bo", "Ana"]);

    receive({ type: "count", id: ana.id, count: 10 });
    expect(names()).toEqual(["Me", "Ana", "Bo"]);
  });

  it("follows joins, leaves, counts and renames live", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you);
    expect(heading()).toHaveTextContent("1 player online");

    receive({ type: "player_joined", player: ana });
    expect(heading()).toHaveTextContent("2 players online");

    receive({ type: "count", id: ana.id, count: 3 });
    expect(card("Ana")).toHaveTextContent("3 clicks");

    receive({ type: "renamed", id: ana.id, name: "Anabel" });
    expect(card("Anabel")).toBeDefined();

    receive({ type: "player_left", id: ana.id });
    expect(heading()).toHaveTextContent("1 player online");
    expect(screen.queryByText("Anabel")).not.toBeInTheDocument();
  });

  it("empties when the connection drops", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you, [you, ana]);

    act(() => MockWebSocket.latest().drop());

    expect(heading()).toHaveTextContent("0 players online");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("says you're offline after you disconnect", async () => {
    const user = userEvent.setup();
    renderWithRoom(
      <>
        <ConnectionToggle />
        <PlayerGrid />
      </>,
    );
    joinRoom(you);

    await user.click(screen.getByRole("switch", { name: "Live" }));

    expect(
      screen.getByText("You're offline. Switch Live back on to rejoin."),
    ).toBeInTheDocument();
  });
});
