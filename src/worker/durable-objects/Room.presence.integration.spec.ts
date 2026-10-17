import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ServerMessage } from "@shared/protocol";
import {
  connectToRoom,
  drain,
  type TestSocket,
} from "@worker/test-utils/socket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PING_SWEEP_INTERVAL_MS, STALE_SOCKET_MS } from "./Room";

// Each test uses its own Room instance (unique name), so its players are
// the only ones online.
const room = () => env.ROOM.getByName(crypto.randomUUID());
type RoomStub = ReturnType<typeof room>;
// Shaped like the ids the Worker mints: 32 lowercase hex characters.
const newPlayerId = () => crypto.randomUUID().replaceAll("-", "");

async function join(stub: RoomStub, playerId = newPlayerId()) {
  const socket = await connectToRoom(stub, playerId);
  const welcome = await socket.next();
  if (welcome.type !== "welcome") throw new Error("expected welcome");
  return { ...socket, id: playerId, welcome };
}

/** Pings until a `player_left` arrives, and returns every message seen. */
async function untilLeft(socket: TestSocket) {
  let seen: ServerMessage[] = [];
  for (let i = 0; i < 5; i++) {
    seen = [...seen, ...(await drain(socket))];
    if (seen.some((m) => m.type === "player_left")) break;
  }
  return seen;
}

const ping = { type: "ping", t: 0 };

const leaves = (messages: ServerMessage[]) =>
  messages.filter((m) => m.type === "player_left");

/** The joins and leaves among `messages`, in order. */
const presence = (messages: ServerMessage[]) =>
  messages
    .filter((m) => m.type === "player_joined" || m.type === "player_left")
    .map((m) => m.type);

// Only the clock is faked: the Room runs in the test's isolate, so moving
// Date here ages every socket's last ping.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Room presence", () => {
  it("drops a socket that stops pinging, closes it and announces the leave", async () => {
    const stub = room();
    const watcher = await join(stub);
    const ghost = await join(stub);
    await drain(watcher); // discard the ghost's player_joined
    const closed = new Promise<number>((resolve) =>
      ghost.ws.addEventListener("close", (event) => resolve(event.code)),
    );

    vi.advanceTimersByTime(STALE_SOCKET_MS + 1);

    // The watcher's ping refreshes it, then sweeps the ghost.
    expect(leaves(await untilLeft(watcher))).toEqual([
      { type: "player_left", id: ghost.id },
    ]);
    expect(await closed).toBe(1001);
  });

  it("keeps a socket that pings within the window", async () => {
    const stub = room();
    const watcher = await join(stub);
    const player = await join(stub);
    await drain(watcher);

    // Each ping lands inside the window, though the player's first one
    // came long after it connected.
    vi.advanceTimersByTime(STALE_SOCKET_MS - 1000);
    await drain(player);
    await drain(watcher);
    vi.advanceTimersByTime(STALE_SOCKET_MS - 1000);

    expect(leaves(await drain(watcher))).toEqual([]);
    expect(leaves(await drain(watcher))).toEqual([]);
    const newcomer = await join(stub);
    expect(newcomer.welcome.online.map((p) => p.id)).toContain(player.id);
  });

  it("announces a player with several stale tabs once", async () => {
    const stub = room();
    const watcher = await join(stub);
    const playerId = newPlayerId();
    await join(stub, playerId);
    await join(stub, playerId);
    await drain(watcher);

    vi.advanceTimersByTime(STALE_SOCKET_MS + 1);

    const seen = await untilLeft(watcher);
    // One more round trip, so a second announcement would have arrived.
    expect(leaves([...seen, ...(await drain(watcher))])).toEqual([
      { type: "player_left", id: playerId },
    ]);
  });

  it("ignores what a swept socket's client sent before the close", async () => {
    const stub = room();
    const watcher = await join(stub);
    const ghost = await join(stub);
    await drain(watcher);
    vi.advanceTimersByTime(STALE_SOCKET_MS + 1);

    // One turn of the Room, so the ghost's late ping lands after the sweep
    // and before its client could answer the close.
    await runInDurableObject(stub, async (instance, state) => {
      const [watcherWs] = state.getWebSockets(watcher.id);
      const [ghostWs] = state.getWebSockets(ghost.id);
      await instance.webSocketMessage(watcherWs, JSON.stringify(ping));
      expect(ghostWs.readyState).not.toBe(WebSocket.OPEN);
      await instance.webSocketMessage(ghostWs, JSON.stringify(ping));
    });
  });

  it("leaves a stale socket out of a newcomer's welcome", async () => {
    const stub = room();
    const ghost = await join(stub);

    vi.advanceTimersByTime(STALE_SOCKET_MS + 1);
    const newcomer = await join(stub);

    expect(newcomer.welcome.online.map((p) => p.id)).toEqual([newcomer.id]);
    expect(newcomer.welcome.online.map((p) => p.id)).not.toContain(ghost.id);
  });

  it("lets a player leave when an abandoned tab of theirs never closed", async () => {
    // Like a reload under the dev server: one socket of the player's is
    // never closed, and only the other keeps pinging.
    const stub = room();
    const watcher = await join(stub);
    const playerId = newPlayerId();
    await join(stub, playerId); // abandoned: never pings or closes
    const live = await join(stub, playerId);
    await drain(watcher);

    // The watcher and the live tab keep pinging; the abandoned tab ages out.
    vi.advanceTimersByTime(STALE_SOCKET_MS - 5000);
    await drain(watcher);
    await drain(live);
    vi.advanceTimersByTime(PING_SWEEP_INTERVAL_MS);
    await drain(live); // sweeps the abandoned socket
    // The player still has a live tab, so nobody is told they left.
    expect(leaves(await drain(watcher))).toEqual([]);

    live.close();
    expect(leaves(await untilLeft(watcher))).toEqual([
      { type: "player_left", id: playerId },
    ]);
  });

  it("sweeps on a ping at most once per interval", async () => {
    const stub = room();
    const ghost = await join(stub);
    vi.advanceTimersByTime(STALE_SOCKET_MS - 5000);
    const watcher = await join(stub); // sweeps; the ghost isn't stale yet
    vi.advanceTimersByTime(6000);

    // The ghost is stale now, but the last sweep was only 6 s ago. A ping
    // sweeps after its pong, so the second round trip would show a leave.
    const seen = [...(await drain(watcher)), ...(await drain(watcher))];
    expect(leaves(seen)).toEqual([]);

    vi.advanceTimersByTime(PING_SWEEP_INTERVAL_MS);
    expect(leaves(await untilLeft(watcher))).toEqual([
      { type: "player_left", id: ghost.id },
    ]);
  });

  it("announces a player who rejoins over a stale socket of theirs", async () => {
    const stub = room();
    const playerId = newPlayerId();
    await join(stub, playerId); // abandoned
    vi.advanceTimersByTime(STALE_SOCKET_MS - 1000);
    const watcher = await join(stub);
    vi.advanceTimersByTime(2000);

    const back = await join(stub, playerId);

    expect(back.welcome.online.map((p) => p.id)).toContain(playerId);
    // The stale socket leaves, then the player joins again, so watchers end
    // up listing them.
    const seen = [...(await drain(watcher)), ...(await drain(watcher))];
    expect(presence(seen)).toEqual(["player_left", "player_joined"]);
  });

  it("announces the leave when a player's live tab closes beside a stale one", async () => {
    const stub = room();
    const playerId = newPlayerId();
    await join(stub, playerId); // abandoned
    vi.advanceTimersByTime(62_000);
    const watcher = await join(stub);
    const live = await join(stub, playerId);
    vi.advanceTimersByTime(STALE_SOCKET_MS - 67_000);
    await drain(live); // a sweep runs, but nothing is stale yet
    await drain(watcher);
    vi.advanceTimersByTime(6000);

    // The abandoned tab is stale now and pings won't sweep for a while, so
    // only the close itself can notice the player has gone.
    live.close();
    expect(leaves(await untilLeft(watcher))).toEqual([
      { type: "player_left", id: playerId },
    ]);
  });
});
