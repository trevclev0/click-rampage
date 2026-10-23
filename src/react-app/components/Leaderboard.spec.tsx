import type { LeaderboardEntry } from "@shared/protocol";
import {
  joinRoom,
  makePlayer,
  receive,
  renderWithRoom,
} from "@test-utils/roomTestUtils";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Leaderboard } from "./Leaderboard";

const you = makePlayer({ name: "Me", count: 412 });

/** Ten players ranked 1–10, with ids that never match yours. */
const tenPlayers: LeaderboardEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: String(i).repeat(32),
  name: `Pro ${i + 1}`,
  count: 1000 - i,
  rank: i + 1,
}));

const showBoard = (
  top: LeaderboardEntry[],
  standing: { rank: number; count: number } | null = null,
  total = 1234567,
) => receive({ type: "leaderboard", total, top, you: standing });

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");
const rowFor = (name: string) =>
  rows().find((row) => within(row).queryByText(name)) as HTMLElement;

describe("Leaderboard", () => {
  it("waits for the room before showing standings", () => {
    renderWithRoom(<Leaderboard />);

    expect(
      screen.getByRole("heading", { name: "All-time leaderboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting for the room…")).toBeInTheDocument();
  });

  it("shows the room total and the top 3 until asked for all", async () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(you);
    showBoard(tenPlayers, { rank: 23, count: 412 });

    expect(screen.getByText(/Everyone together/)).toHaveTextContent(
      "Everyone together: 1,234,567 clicks",
    );
    expect(rowFor("Pro 3")).toBeDefined();
    expect(rowFor("Pro 4")).toBeUndefined();

    const toggle = screen.getByRole("button", { name: "Show all 10" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);

    expect(rowFor("Pro 10")).toBeDefined();
    expect(screen.getByRole("button", { name: "Show top 3" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("has no toggle when there are 3 players or fewer", () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(you);
    showBoard(tenPlayers.slice(0, 3));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("adds your rank below the list when you're not on it", () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(you);
    showBoard(tenPlayers, { rank: 23, count: 412 });

    const mine = rows().at(-1) as HTMLElement;
    expect(mine).toHaveTextContent("23");
    expect(mine).toHaveTextContent("Me");
    expect(mine).toHaveTextContent("412");
    expect(within(mine).getByText("You")).toBeInTheDocument();
  });

  it("lists you once when you're on the board", () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(you);
    const withYou = [
      ...tenPlayers.slice(0, 9),
      { ...you, count: 991, rank: 10 },
    ];
    showBoard(withYou, { rank: 10, count: 991 });

    // Collapsed: you're past the top 3, so your row follows them.
    expect(
      rows().filter((row) => row.textContent?.includes("Me")),
    ).toHaveLength(1);
  });

  it("gives you your own row when a tie leaves you just off the list", () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(you);
    // Tied at 10th with Pro 10, but the list stopped at ten names.
    showBoard(tenPlayers, { rank: 10, count: 991 });

    expect(rowFor("Me")).toHaveTextContent("10");
  });

  it("draws the gap only when players are left out above you", async () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(you);
    const withYou = [...tenPlayers.slice(0, 3), { ...you, rank: 4 }];
    showBoard(withYou, { rank: 4, count: 412 });

    // Collapsed to the top 3, you're 4th: nobody is skipped.
    expect(screen.queryByText("⋯")).toBeNull();

    showBoard(tenPlayers, { rank: 12, count: 412 });
    await userEvent.click(screen.getByRole("button", { name: "Show all 10" }));
    expect(screen.getByText("⋯")).toBeInTheDocument();
  });

  it("shows an online player's new name before the next push", () => {
    const ana = makePlayer({ id: tenPlayers[0].id, name: "Ana" });
    renderWithRoom(<Leaderboard />);
    joinRoom(you, [you, ana]);
    showBoard([
      { ...tenPlayers[0], name: "Old Ana" },
      { ...you, name: "Old me", rank: 2 },
    ]);

    expect(rows()[0]).toHaveTextContent("Ana");
    expect(rows()[0]).not.toHaveTextContent("Old Ana");
    expect(rows()[1]).toHaveTextContent("Me");
    expect(rows()[1]).not.toHaveTextContent("Old me");
  });

  it("marks players who are online now", () => {
    const ana = makePlayer({ id: tenPlayers[0].id, name: "Pro 1" });
    renderWithRoom(<Leaderboard />);
    joinRoom(you, [you, ana]);
    showBoard(tenPlayers);

    expect(within(rowFor("Pro 1")).getByText("online")).toBeInTheDocument();
    expect(within(rowFor("Pro 2")).queryByText("online")).toBeNull();
  });

  it("invites you to click when you're not ranked yet", () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(makePlayer({ name: "Me", count: 0 }));
    showBoard(tenPlayers.slice(0, 2));

    expect(screen.getByText("Click to get on the board")).toBeInTheDocument();
  });

  it("says when nobody has clicked yet", () => {
    renderWithRoom(<Leaderboard />);
    joinRoom(makePlayer({ name: "Me", count: 0 }));
    showBoard([], null, 0);

    expect(
      screen.getByText("No clicks yet. Be the first!"),
    ).toBeInTheDocument();
  });
});
