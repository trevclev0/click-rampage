import { describe, expect, it } from "vitest";
import {
  defaultPlayerName,
  MAX_NAME_LENGTH,
  normalizePlayerName,
} from "./player";

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
