import { describe, expect, it } from "vitest";
import {
  AVATAR_TONES,
  avatarTone,
  formatCount,
  initials,
  shortId,
} from "./playerDisplay";

describe("initials", () => {
  it.each([
    ["Player a1b2", "PA"],
    ["rage", "R"],
    ["  click   rampage  forever ", "CR"],
    ["🔥 blaze", "🔥B"],
    ["👍🏽 thumbs", "👍🏽T"],
    ["   ", "?"],
  ])("%j → %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
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
