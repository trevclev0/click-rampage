import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ServerMessage } from "@shared/protocol";
import {
  connectToRoom,
  drain,
  type TestSocket,
} from "@worker/test-utils/socket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLUSH_INTERVAL_MS, MAX_INCREMENTS_PER_SECOND } from "./Room";

// Each test uses its own Room instance (unique name) so dirty counts and
// flush timers never leak between tests.
const room = () => env.ROOM.getByName(crypto.randomUUID());
type RoomStub = ReturnType<typeof room>;
// Shaped like the ids the Worker mints: 32 lowercase hex characters.
const newPlayerId = () => crypto.randomUUID().replaceAll("-", "");

/**
 * Stops the clock, so no flush timer fires and no rate-limit window rolls
 * over until a test says so. The Room runs in the test's isolate, so this
 * fakes its timers too.
 */
const freezeTime = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

/** Fires due timers inside the Room, where its real timers would run. */
const advanceTime = (stub: RoomStub, ms: number) =>
  runInDurableObject(stub, () => {
    vi.advanceTimersByTime(ms);
  });

/** The count SQLite holds for a player, whatever the Room has in memory. */
function storedCount(state: DurableObjectState, id: string): number {
  return state.storage.sql
    .exec<{ count: number }>("SELECT count FROM players WHERE id = ?", id)
    .one().count;
}

const readStoredCount = (stub: RoomStub, id: string) =>
  runInDurableObject(stub, (_, state) => storedCount(state, id));

/**
 * Sums rowsWritten over every SQL statement run from now on. It spies on
 * the real storage API and calls through, so nothing is faked.
 */
function trackRowsWritten(state: DurableObjectState) {
  const exec = vi.spyOn(state.storage.sql, "exec");
  return () =>
    exec.mock.results.reduce(
      (rows, result) =>
        rows + (result.type === "return" ? result.value.rowsWritten : 0),
      0,
    );
}

async function nextOfType(socket: TestSocket, type: ServerMessage["type"]) {
  for (;;) {
    const message = await socket.next();
    if (message.type === type) return message;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Room write batching", () => {
  it("writes 100 accepted increments as a single row", async () => {
    const stub = room();
    const id = newPlayerId();
    await stub.getOrCreatePlayer(id); // creating the row is not a click

    // One synchronous block: no flush timer can fire part-way through.
    await runInDurableObject(stub, (instance, state) => {
      const rowsWritten = trackRowsWritten(state);

      for (let i = 0; i < 100; i++) instance.increment(id);
      expect(instance.getOrCreatePlayer(id).count).toBe(100);
      expect(storedCount(state, id)).toBe(0);
      expect(rowsWritten()).toBe(0);

      expect(instance.flush()).toBe(1);
      expect(rowsWritten()).toBe(1);
      expect(storedCount(state, id)).toBe(100);
    });
  });

  it("holds socket clicks in memory until the flush timer fires", async () => {
    const stub = room();
    const id = newPlayerId();
    const socket = await connectToRoom(stub, id);
    await socket.next(); // welcome
    const rowsWritten = await runInDurableObject(stub, (_, state) =>
      trackRowsWritten(state),
    );
    freezeTime();

    for (let i = 0; i < 100; i++) socket.send({ type: "increment" });
    const counts = (await drain(socket)).filter((m) => m.type === "count");
    expect(counts).toHaveLength(MAX_INCREMENTS_PER_SECOND);
    expect(counts.at(-1)).toEqual({
      type: "count",
      id,
      count: MAX_INCREMENTS_PER_SECOND,
    });
    expect(await readStoredCount(stub, id)).toBe(0);
    expect(rowsWritten()).toBe(0);

    await advanceTime(stub, FLUSH_INTERVAL_MS);

    expect(await readStoredCount(stub, id)).toBe(MAX_INCREMENTS_PER_SECOND);
    expect(rowsWritten()).toBe(1);
  });

  it("keeps flushed counts when the instance is evicted", async () => {
    const name = crypto.randomUUID();
    const stub = env.ROOM.getByName(name);
    const id = newPlayerId();
    for (let i = 0; i < 3; i++) await stub.increment(id);
    await runInDurableObject(stub, (instance) => instance.flush());

    await evictDurableObject(stub);

    const fresh = env.ROOM.getByName(name);
    expect((await fresh.getOrCreatePlayer(id)).count).toBe(3);
  });

  it("flushes as soon as a player's last socket closes", async () => {
    const stub = room();
    const id = newPlayerId();
    const watcher = await connectToRoom(stub, newPlayerId());
    await watcher.next(); // welcome
    const player = await connectToRoom(stub, id);
    await player.next(); // welcome
    freezeTime(); // so only the close can have written the clicks

    for (let i = 0; i < 3; i++) player.send({ type: "increment" });
    await drain(player);
    player.close();
    await nextOfType(watcher, "player_left");

    expect(await readStoredCount(stub, id)).toBe(3);
  });

  it("keeps counts dirty when a flush fails, then retries", async () => {
    const stub = room();
    const id = newPlayerId();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await runInDurableObject(stub, (instance, state) => {
      for (let i = 0; i < 3; i++) instance.increment(id);
      // Hide the table so the real UPDATE fails, as a storage error would.
      state.storage.sql.exec("ALTER TABLE players RENAME TO players_away");
      expect(instance.flush()).toBe(0);
      state.storage.sql.exec("ALTER TABLE players_away RENAME TO players");

      expect(storedCount(state, id)).toBe(0);
      expect(instance.getOrCreatePlayer(id).count).toBe(3);
    });

    expect(errors).toHaveBeenCalledOnce();
    expect(JSON.parse(String(errors.mock.calls[0]?.[0]))).toMatchObject({
      level: "error",
      event: "room_flush_failed",
      pendingPlayers: 1,
      message: expect.stringContaining("no such table"),
    });

    // Real time: the failed flush re-armed the timer, and its retry writes.
    await vi.waitFor(
      async () => expect(await readStoredCount(stub, id)).toBe(3),
      { timeout: 3 * FLUSH_INTERVAL_MS, interval: 100 },
    );
    expect(errors).toHaveBeenCalledOnce();
  });

  it("reports unflushed counts in welcome and player_joined", async () => {
    const stub = room();
    const id = newPlayerId();
    const watcher = await connectToRoom(stub, newPlayerId());
    await watcher.next(); // welcome
    freezeTime();
    for (let i = 0; i < 3; i++) await stub.increment(id);

    const player = await connectToRoom(stub, id);
    const latecomer = await connectToRoom(stub, newPlayerId());

    const counted = expect.objectContaining({ id, count: 3 });
    expect(await player.next()).toMatchObject({ you: counted });
    expect(await watcher.next()).toEqual({
      type: "player_joined",
      player: counted,
    });
    expect(await latecomer.next()).toMatchObject({
      online: expect.arrayContaining([counted]),
    });
    // None of that came from SQLite: the clicks are not written yet.
    expect(await readStoredCount(stub, id)).toBe(0);
  });

  it("returns the in-memory count from rename and writes it too", async () => {
    const stub = room();
    const id = newPlayerId();

    await runInDurableObject(stub, (instance, state) => {
      instance.increment(id);
      instance.increment(id);

      expect(instance.rename(id, "Rager")).toEqual({
        ok: true,
        player: { id, name: "Rager", count: 2 },
      });
      // The rename's row write carried the count, so nothing is pending.
      expect(storedCount(state, id)).toBe(2);
      expect(instance.flush()).toBe(0);
    });
  });
});
