import type { Player } from "@shared/player";
import type { ServerMessage } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { initialRoomState, type RoomState, roomReducer } from "./roomReducer";

const you: Player = { id: "a".repeat(32), name: "Player aaaa", count: 3 };
const them: Player = { id: "b".repeat(32), name: "Player bbbb", count: 7 };

const receive = (state: RoomState, message: ServerMessage, receivedAt = 0) =>
  roomReducer(state, { type: "message", message, receivedAt });

const connected = receive(initialRoomState, {
  type: "welcome",
  you,
  online: [you, them],
});

describe("roomReducer", () => {
  it("starts connecting with nothing known", () => {
    expect(initialRoomState).toMatchObject({
      status: "connecting",
      you: null,
      online: [],
      latency: null,
    });
  });

  it("welcome connects and sets you and the online list", () => {
    expect(connected).toMatchObject({
      status: "connected",
      you,
      online: [you, them],
    });
  });

  it("welcome clears a previous error", () => {
    const errored = receive(initialRoomState, {
      type: "error",
      code: "invalid_name",
      message: "bad",
    });
    expect(errored.lastError?.code).toBe("invalid_name");
    expect(
      receive(errored, { type: "welcome", you, online: [you] }).lastError,
    ).toBeNull();
  });

  it("player_joined adds a player once", () => {
    const newcomer = { id: "c".repeat(32), name: "New", count: 0 };
    const joined = receive(connected, {
      type: "player_joined",
      player: newcomer,
    });
    const again = receive(joined, { type: "player_joined", player: newcomer });

    expect(again.online.map((p) => p.id)).toEqual([
      you.id,
      them.id,
      newcomer.id,
    ]);
  });

  it("player_left removes the player", () => {
    const left = receive(connected, { type: "player_left", id: them.id });
    expect(left.online).toEqual([you]);
  });

  it("count updates the player in the list and you", () => {
    const counted = receive(connected, { type: "count", id: you.id, count: 4 });
    expect(counted.you?.count).toBe(4);
    expect(counted.online[0].count).toBe(4);
    expect(counted.online[1]).toBe(them);
  });

  it("count for someone else leaves you untouched", () => {
    const counted = receive(connected, {
      type: "count",
      id: them.id,
      count: 8,
    });
    expect(counted.you).toBe(connected.you);
    expect(counted.online[1].count).toBe(8);
  });

  it("renamed updates the name everywhere", () => {
    const renamed = receive(connected, {
      type: "renamed",
      id: you.id,
      name: "Rage",
    });
    expect(renamed.you?.name).toBe("Rage");
    expect(renamed.online[0].name).toBe("Rage");
  });

  it("pong records round-trip latency, never negative", () => {
    expect(receive(connected, { type: "pong", t: 100 }, 142).latency).toBe(42);
    expect(receive(connected, { type: "pong", t: 100 }, 90).latency).toBe(0);
  });

  it.each(["connecting", "disconnected"] as const)(
    "%s clears live data but keeps you",
    (status) => {
      const withLatency = receive(connected, { type: "pong", t: 0 }, 10);
      const next = roomReducer(withLatency, { type: "status", status });

      expect(next).toMatchObject({ status, you, online: [], latency: null });
    },
  );
});
