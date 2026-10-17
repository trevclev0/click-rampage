import { describe, expect, it } from "vitest";
import {
  AVATAR_TONES,
  avatarTone,
  formatCount,
  initials,
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
