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
    // Looks like a default name, but not this player's, so it was chosen.
    ["Player a1b2", "PA"],
  ])("%j → %j", (name, expected) => {
    expect(initials({ id, name })).toBe(expected);
  });

  it("uses the id for a default name, so players don't all show P", () => {
    expect(initials({ id, name: "Player 89c2" })).toBe("89");
    expect(initials({ id: "e4".padEnd(32, "0"), name: "Player e400" })).toBe(
      "E4",
    );
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
