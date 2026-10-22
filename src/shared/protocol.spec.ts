import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  parseServerMessage,
  serverMessageSchema,
} from "./protocol";

describe("parseClientMessage", () => {
  it.each([
    [{ type: "increment" }],
    [{ type: "rename", name: "Rage" }],
    [{ type: "ping", t: 123 }],
  ])("accepts %j", (message) => {
    expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  });

  it("strips unknown fields, such as a forged id", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "increment", id: "someone" })),
    ).toEqual({ type: "increment" });
  });

  it.each([
    ["non-JSON", "not json"],
    ["unknown type", JSON.stringify({ type: "explode" })],
    ["missing field", JSON.stringify({ type: "ping" })],
    ["wrong field type", JSON.stringify({ type: "rename", name: 42 })],
  ])("rejects %s", (_, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  // Padding goes in an unknown field (stripped by the schema), so these
  // frames are otherwise valid and only the size limit can reject them.
  const pingWithPadding = (pad: string) =>
    JSON.stringify({ type: "ping", t: 1, pad });

  it("rejects a frame over the limit", () => {
    expect(
      parseClientMessage(pingWithPadding("x".repeat(MAX_MESSAGE_BYTES))),
    ).toBeNull();
  });

  it("measures the limit in UTF-8 bytes, not characters", () => {
    // 400 "€" = 400 characters but 1,200 bytes.
    const frame = pingWithPadding("€".repeat(400));

    expect(frame.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(frame)).toBeNull();
  });

  it("accepts a valid frame just under the limit", () => {
    expect(parseClientMessage(pingWithPadding("x".repeat(900)))).toEqual({
      type: "ping",
      t: 1,
    });
  });

  it("rejects binary frames", () => {
    expect(parseClientMessage(new ArrayBuffer(4))).toBeNull();
  });
});

describe("serverMessageSchema", () => {
  it("rejects a negative count", () => {
    expect(
      serverMessageSchema.safeParse({ type: "count", id: "a", count: -1 })
        .success,
    ).toBe(false);
  });

  const leaderboard = {
    type: "leaderboard",
    total: 12,
    top: [{ id: "a", name: "Ana", count: 12, rank: 1 }],
    you: { rank: 1, count: 12 },
  };

  it("accepts a leaderboard, with or without your rank", () => {
    expect(serverMessageSchema.parse(leaderboard)).toEqual(leaderboard);
    expect(
      serverMessageSchema.safeParse({ ...leaderboard, you: null }).success,
    ).toBe(true);
  });

  it.each([
    ["a zero rank", { top: [{ id: "a", name: "Ana", count: 12, rank: 0 }] }],
    ["a negative total", { total: -1 }],
    ["a zero-click you", { you: { rank: 1, count: 0 } }],
  ])("rejects a leaderboard with %s", (_, patch) => {
    expect(
      serverMessageSchema.safeParse({ ...leaderboard, ...patch }).success,
    ).toBe(false);
  });
});

describe("parseServerMessage", () => {
  it("parses a valid frame", () => {
    const message = { type: "pong", t: 5 };
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    ["binary", new ArrayBuffer(2)],
    ["non-JSON", "nope"],
    ["unknown type", JSON.stringify({ type: "explode" })],
  ])("rejects %s", (_, raw) => {
    expect(parseServerMessage(raw)).toBeNull();
  });
});
