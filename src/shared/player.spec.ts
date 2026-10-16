import { describe, expect, it } from "vitest";
import {
  cleanPlayerName,
  defaultPlayerName,
  MAX_NAME_LENGTH,
  normalizePlayerName,
  visibleLength,
} from "./player";

describe("cleanPlayerName", () => {
  it("trims and collapses whitespace runs without a length check", () => {
    expect(cleanPlayerName(`  Ab${" ".repeat(20)}Cd\t\n`)).toBe("Ab Cd");
    expect(cleanPlayerName("x".repeat(MAX_NAME_LENGTH + 5))).toHaveLength(
      MAX_NAME_LENGTH + 5,
    );
  });

  it("strips control, zero-width and bidi characters", () => {
    expect(cleanPlayerName("Ev\u0000il\u200B\u202EBob\n")).toBe("EvilBob");
  });

  it("splits ZWJ emoji sequences apart, so they count as more", () => {
    const coder = "\u{1F469}\u200D\u{1F4BB}"; // 👩‍💻

    expect(visibleLength(coder)).toBe(1);
    expect(visibleLength(cleanPlayerName(coder))).toBe(2);
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(cleanPlayerName(" \u200B\u0007 ")).toBe("");
  });
});

describe("normalizePlayerName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizePlayerName("  Rage   Clicker  ")).toBe("Rage Clicker");
  });

  it("strips control, zero-width and bidi characters", () => {
    expect(normalizePlayerName("Ev\u0000il​‮Bob\n")).toBe("EvilBob");
  });

  it("accepts exactly the max length, counting emoji as one", () => {
    expect(normalizePlayerName("x".repeat(MAX_NAME_LENGTH))).toHaveLength(20);
    expect(normalizePlayerName("🔥".repeat(MAX_NAME_LENGTH))).not.toBeNull();
  });

  it("counts a skin-toned emoji (two code points) as one character", () => {
    const thumbs = "\u{1F44D}\u{1F3FD}"; // 👍🏽

    expect(normalizePlayerName(thumbs.repeat(MAX_NAME_LENGTH))).not.toBeNull();
    expect(normalizePlayerName(thumbs.repeat(MAX_NAME_LENGTH + 1))).toBeNull();
  });

  it.each(["", "   ", "​\u0007", "x".repeat(MAX_NAME_LENGTH + 1)])(
    "rejects %j",
    (input) => {
      expect(normalizePlayerName(input)).toBeNull();
    },
  );
});

describe("defaultPlayerName", () => {
  it("uses the first four characters of the id", () => {
    expect(defaultPlayerName("3f2b8c1e-9a4d")).toBe("Player 3f2b");
  });
});
