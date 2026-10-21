import type { Player } from "@shared/player";
import { describe, expect, it } from "vitest";
import {
  AVATAR_TONES,
  avatarTone,
  formatCount,
  initials,
  orderPlayers,
  shortId,
} from "./playerDisplay";

describe("initials", () => {
  const id = "89c2".padEnd(32, "0");

  it.each([
    ["rage", "R"],
    ["  click   rampage  forever ", "CR"],
    ["🔥 blaze", "🔥B"],
    ["👍🏽 thumbs", "👍🏽T"],
    ["   ", "?"],
  ])("takes the first letters of a custom name: %j → %j", (name, expected) => {
    expect(initials({ id, name })).toBe(expected);
  });

  it("takes the start of the id for a default name", () => {
    expect(initials({ id, name: "Player 89c2" })).toBe("89");
    // Upper-cased like letter initials.
    const hexId = "e4ab".padEnd(32, "0");
    expect(initials({ id: hexId, name: "Player e4ab" })).toBe("E4");
  });

  it.each([
    // Someone else's default name, typed in as a custom one.
    ["Player e4ab", "PE"],
    // Near misses of this player's own default name.
    ["player 89c2", "P8"],
    ["Player 89c", "P8"],
    ["Player 89c2 jr", "P8"],
  ])(
    "keeps first letters for %j, which is not this id's default",
    (name, expected) => {
      expect(initials({ id, name })).toBe(expected);
    },
  );
});

describe("orderPlayers", () => {
  const player = (id: string, count: number): Player => ({
    id,
    name: id,
    count,
  });
  // In join order. The tied ids run backwards, so a tiebreak on id (or
  // name) would show.
  const joined = [
    player("d", 4),
    player("me", 1),
    player("b", 7),
    player("c", 4),
    player("a", 4),
  ];
  const ids = (players: readonly Player[]) => players.map(({ id }) => id);

  it("puts you first even with the fewest clicks, then the most clicks", () => {
    expect(ids(orderPlayers(joined, "me"))).toEqual(["me", "b", "d", "c", "a"]);
  });

  it("keeps join order for ties, yours included", () => {
    const tied = joined.map(({ id }) => player(id, 0));
    expect(ids(orderPlayers(tied, "c"))).toEqual(["c", "d", "me", "b", "a"]);
  });

  it("orders by clicks alone before you're known", () => {
    expect(ids(orderPlayers(joined, undefined))).toEqual([
      "b",
      "d",
      "c",
      "a",
      "me",
    ]);
  });

  it("returns a new array of the same players, leaving the input alone", () => {
    const ordered = orderPlayers(joined, "me");

    expect(ids(joined)).toEqual(["d", "me", "b", "c", "a"]);
    // The same objects, so memoised cards whose player didn't change
    // still skip rendering.
    for (const p of ordered) expect(joined).toContain(p);
  });

  it("keeps the order shown for ties, passing only on strictly more", () => {
    const shown = ["me", "c", "d"];
    const race = (c: number, d: number) =>
      ids(
        orderPlayers([player("d", d), player("me", 0), player("c", c)], "me", {
          previous: shown,
        }),
      );

    // d catches up with c, but doesn't pass, so nothing moves.
    expect(race(5, 5)).toEqual(["me", "c", "d"]);
    expect(race(6, 7)).toEqual(["me", "d", "c"]);
    // Ties go by what was shown, not by join order (d joined first).
    expect(race(4, 4)).toEqual(["me", "c", "d"]);
  });

  it("puts players new to the order after it, in join order", () => {
    const players = [player("x", 0), player("me", 0), player("y", 0)];

    expect(
      ids(
        orderPlayers([...players, player("a", 0)], "me", {
          previous: ["me", "a"],
        }),
      ),
    ).toEqual(["me", "a", "x", "y"]);
    // A newcomer with more clicks still passes.
    expect(
      ids(
        orderPlayers([player("x", 3), player("me", 0)], "me", {
          previous: ["me", "a"],
        }),
      ),
    ).toEqual(["me", "x"]);
  });

  it("keeps the shown order while frozen, adding newcomers at the end", () => {
    const players = [player("b", 9), player("me", 0), player("a", 1)];

    expect(
      ids(
        orderPlayers([...players, player("n", 50)], "me", {
          previous: ["me", "a", "gone", "b"],
          frozen: true,
        }),
      ),
    ).toEqual(["me", "a", "b", "n"]);
  });

  it("puts you first even while frozen", () => {
    expect(
      ids(
        orderPlayers([player("a", 1), player("me", 0)], "me", {
          previous: ["a"],
          frozen: true,
        }),
      ),
    ).toEqual(["me", "a"]);
  });
});

describe("avatarTone", () => {
  it("is stable for an id and always in range", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(avatarTone(id)).toBe(avatarTone(id));

    const tones = new Set(
      Array.from({ length: 200 }, (_, i) =>
        avatarTone(i.toString(16).padStart(32, "0")),
      ),
    );
    for (const tone of tones) {
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(AVATAR_TONES);
    }
    // Similar ids still spread across the palette.
    expect(tones.size).toBe(AVATAR_TONES);
  });
});

describe("shortId", () => {
  it("keeps the first six characters", () => {
    expect(shortId("abcdef0123456789")).toBe("abcdef");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1234567)).toBe((1234567).toLocaleString());
  });
});
