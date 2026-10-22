// @vitest-environment node
import type { Player } from "@shared/player";
import { describe, expect, it } from "vitest";
import { rankStandings } from "./standings";

const player = (id: string, count: number, name = `Player ${id}`): Player => ({
  id,
  name,
  count,
});

const summary = (players: Player[]) =>
  rankStandings(players).map(({ id, rank }) => `${rank}:${id}`);

describe("rankStandings", () => {
  it("ranks by count, best first, with tied players sharing a rank", () => {
    expect(
      summary([player("a", 5), player("b", 9), player("c", 5), player("d", 1)]),
    ).toEqual(["1:b", "2:a", "2:c", "4:d"]);
  });

  it("leaves out players who have never clicked", () => {
    expect(summary([player("a", 0), player("b", 2)])).toEqual(["1:b"]);
  });

  it("orders a tie by name, then id, so it doesn't shuffle", () => {
    expect(
      summary([
        player("z", 3, "Bo"),
        player("y", 3, "Ana"),
        player("x", 3, "Bo"),
      ]),
    ).toEqual(["1:y", "1:x", "1:z"]);
  });
});
