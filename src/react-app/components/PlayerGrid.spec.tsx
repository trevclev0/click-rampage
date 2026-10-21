import { MockWebSocket } from "@test-utils/mockWebSocket";
import {
  joinRoom,
  makePlayer,
  receive,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConnectionToggle } from "./ConnectionToggle";
import { PlayerGrid } from "./PlayerGrid";

const you = makePlayer({ name: "Me", count: 5 });
const ana = makePlayer({ id: "b".repeat(32), name: "Ana", count: 2 });
const bo = makePlayer({ id: "c".repeat(32), name: "Bo", count: 9 });
const cy = makePlayer({ id: "d".repeat(32), name: "Cy", count: 0 });

const heading = () => screen.getByRole("heading", { level: 2 });
const cards = () => screen.getAllByRole("listitem");
const card = (name: string) =>
  cards().find((item) => within(item).queryByText(name)) as HTMLElement;
const expectOrder = (...names: string[]) =>
  expect(cards().map((item) => item.textContent)).toEqual(
    names.map((name) => expect.stringContaining(name)),
  );

describe("PlayerGrid", () => {
  it("waits for the room before listing anyone", () => {
    renderWithRoom(<PlayerGrid />);

    expect(heading()).toHaveTextContent("0 players online");
    expect(screen.getByText("Waiting for the room…")).toBeInTheDocument();
  });

  it("lists you first, then everyone else by clicks", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you, [ana, you, bo]);

    expect(heading()).toHaveTextContent("3 players online");
    // Bo has more clicks than you, but you still come first.
    expectOrder("Me", "Bo", "Ana");
    expect(within(card("Me")).getByText("You")).toBeInTheDocument();
    expect(within(card("Ana")).queryByText("You")).not.toBeInTheDocument();
  });

  it("reorders live as counts change, moving the same cards", () => {
    renderWithRoom(<PlayerGrid />);
    // Bo joined before Ana, though Ana comes first by id and by name.
    joinRoom(you, [bo, you, ana]);
    expectOrder("Me", "Bo", "Ana");
    const anaCard = card("Ana");
    const boCard = card("Bo");

    receive({ type: "count", id: ana.id, count: 10 });
    expectOrder("Me", "Ana", "Bo");
    // Keyed by id, so the cards moved rather than swapped contents.
    expect(card("Ana")).toBe(anaCard);
    expect(card("Bo")).toBe(boCard);

    // Catching up isn't passing: a tie stays as shown, though Bo joined
    // first.
    receive({ type: "count", id: bo.id, count: 10 });
    expectOrder("Me", "Ana", "Bo");

    receive({ type: "count", id: bo.id, count: 11 });
    expectOrder("Me", "Bo", "Ana");
  });

  it("doesn't swap two players who keep catching up with each other", () => {
    renderWithRoom(<PlayerGrid />);
    // Bo joined first, so a join-order tiebreak would put him above Ana
    // each time he draws level.
    joinRoom(you, [you, { ...bo, count: 2 }, { ...ana, count: 3 }]);
    expectOrder("Me", "Ana", "Bo");

    for (let count = 3; count <= 6; count++) {
      receive({ type: "count", id: bo.id, count });
      expectOrder("Me", "Ana", "Bo");
      receive({ type: "count", id: ana.id, count: count + 1 });
      expectOrder("Me", "Ana", "Bo");
    }

    // Bo draws level at 7, then passes at 8.
    receive({ type: "count", id: bo.id, count: 7 });
    expectOrder("Me", "Ana", "Bo");
    receive({ type: "count", id: bo.id, count: 8 });
    expectOrder("Me", "Bo", "Ana");
  });

  it("holds the order while the pointer is over it, then catches up", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you, [you, ana, bo]);
    expectOrder("Me", "Bo", "Ana");
    const section = screen.getByRole("region", { name: /online/ });

    fireEvent.pointerEnter(section);
    receive({ type: "count", id: ana.id, count: 20 });
    expectOrder("Me", "Bo", "Ana");
    // Counts still update in place.
    expect(card("Ana")).toHaveTextContent("20 clicks");
    // Joins and leaves still show, newcomers at the end.
    receive({ type: "player_joined", player: { ...cy, count: 99 } });
    expectOrder("Me", "Bo", "Ana", "Cy");

    fireEvent.pointerLeave(section);
    expectOrder("Me", "Cy", "Ana", "Bo");
  });

  it("holds the order while focus is inside, then catches up on blur", () => {
    renderWithRoom(<PlayerGrid />);
    joinRoom(you, [you, ana, bo]);
    const [first, second] = cards();

    // Nothing in a card takes focus yet, so focus events stand in for a
    // control inside one.
    fireEvent.focusIn(first);
    receive({ type: "count", id: ana.id, count: 20 });
    expectOrder("Me", "Bo", "Ana");

    // Moving between cards keeps the grid focused.
    fireEvent.focusOut(first, { relatedTarget: second });
    receive({ type: "count", id: ana.id, count: 21 });
    expectOrder("Me", "Bo", "Ana");

    fireEvent.focusOut(second, { relatedTarget: document.body });
    expectOrder("Me", "Ana", "Bo");
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
