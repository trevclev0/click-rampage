import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_BYTES,
  parseClientMessage,
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
    ["oversized frame", `"${"x".repeat(MAX_MESSAGE_BYTES)}"`],
  ])("rejects %s", (_, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
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
});
