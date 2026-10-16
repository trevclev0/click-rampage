import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ServerMessage } from "@shared/protocol";
import {
  connectToRoom,
  drain,
  type TestSocket,
} from "@worker/test-utils/socket";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLUSH_INTERVAL_MS,
  MAX_FLUSH_RETRY_MS,
  MAX_INCREMENTS_PER_SECOND,
} from "./Room";

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

  it("flushes on a fixed cadence, one row per dirty player", async () => {
    const stub = room();
    const id = newPlayerId();
    const idle = await connectToRoom(stub, newPlayerId()); // cached, never clicks
    await idle.next(); // welcome
    const socket = await connectToRoom(stub, id);
    await socket.next(); // welcome
    const rowsWritten = await runInDurableObject(stub, (_, state) =>
      trackRowsWritten(state),
    );
    freezeTime();
    const click = async () => {
      socket.send({ type: "increment" });
      await drain(socket);
    };

    await click();
    await advanceTime(stub, FLUSH_INTERVAL_MS - 1);
    expect(rowsWritten()).toBe(0); // not before the interval
    await click();
    await advanceTime(stub, 1);
    // Steady clicking does not push the flush back, and the idle player
    // is not rewritten.
    expect(await readStoredCount(stub, id)).toBe(2);
    expect(rowsWritten()).toBe(1);
    await click();
    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(await readStoredCount(stub, id)).toBe(3); // the timer re-arms
    expect(rowsWritten()).toBe(2);
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
    // Nothing is dirty, so no flush timer is left keeping the Room awake.
    expect(await runInDurableObject(stub, () => vi.getTimerCount())).toBe(0);
  });

  it("backs off after a failed departure write, too", async () => {
    const stub = room();
    const watcher = await connectToRoom(stub, newPlayerId());
    await watcher.next(); // welcome
    const visitor = await connectToRoom(stub, newPlayerId());
    await visitor.next(); // welcome
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime();

    // The click arms the normal 1 s timer; the departure write then fails.
    visitor.send({ type: "increment" });
    await drain(visitor);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("ALTER TABLE players RENAME TO players_away");
    });
    visitor.close();
    await nextOfType(watcher, "player_left");
    expect(errors).toHaveBeenCalledOnce();

    // One failure means a 2 s wait, not the 1 s timer the click armed.
    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(errors).toHaveBeenCalledOnce();
    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it("leaves a departure during backoff to the retry", async () => {
    const stub = room();
    const leaver = newPlayerId();
    const watcher = await connectToRoom(stub, newPlayerId());
    await watcher.next(); // welcome
    const visitor = await connectToRoom(stub, leaver);
    await visitor.next(); // welcome
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime();

    visitor.send({ type: "increment" });
    await drain(visitor);
    await runInDurableObject(stub, (instance, state) => {
      state.storage.sql.exec("ALTER TABLE players RENAME TO players_away");
      instance.flush(); // fails: the retry backs off to 2 s
    });
    visitor.close();
    await nextOfType(watcher, "player_left");
    // The departure adds no failed write (or error line) of its own.
    expect(errors).toHaveBeenCalledOnce();

    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("ALTER TABLE players_away RENAME TO players");
    });
    await advanceTime(stub, 2 * FLUSH_INTERVAL_MS);
    expect(await readStoredCount(stub, leaver)).toBe(1);

    // Written and offline, it left the cache: a rejoin reads SQLite.
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE players SET count = 999 WHERE id = ?",
        leaver,
      );
    });
    const back = await connectToRoom(stub, leaver);
    expect(await back.next()).toMatchObject({
      type: "welcome",
      you: { count: 999 },
    });
  });

  it("writes only the leaving player when their last socket closes", async () => {
    const stub = room();
    const clicker = newPlayerId();
    const leaver = newPlayerId();
    const socket = await connectToRoom(stub, clicker);
    await socket.next(); // welcome
    const visitor = await connectToRoom(stub, leaver);
    await visitor.next(); // welcome
    const rowsWritten = await runInDurableObject(stub, (_, state) =>
      trackRowsWritten(state),
    );
    freezeTime(); // so the shared timer cannot write anything

    socket.send({ type: "increment" });
    await drain(socket);
    visitor.send({ type: "increment" });
    await drain(visitor);
    visitor.close();
    await nextOfType(socket, "player_left");

    expect(await readStoredCount(stub, leaver)).toBe(1);
    expect(await readStoredCount(stub, clicker)).toBe(0); // left for the timer
    expect(rowsWritten()).toBe(1);

    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(await readStoredCount(stub, clicker)).toBe(1);
    expect(rowsWritten()).toBe(2);
  });

  it("keeps counts dirty when a flush fails, then retries with backoff", async () => {
    const stub = room();
    const id = newPlayerId();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const logged = (call: number) =>
      JSON.parse(String(errors.mock.calls[call]?.[0]));
    freezeTime();

    await runInDurableObject(stub, (instance, state) => {
      for (let i = 0; i < 3; i++) instance.increment(id);
      // Hide the table so the real UPDATE fails, as a storage error would.
      state.storage.sql.exec("ALTER TABLE players RENAME TO players_away");
      expect(instance.flush()).toBe(0);
      expect(instance.getOrCreatePlayer(id).count).toBe(3);
    });

    expect(errors).toHaveBeenCalledOnce();
    expect(logged(0)).toMatchObject({
      level: "error",
      event: "room_flush_failed",
      pendingPlayers: 1,
      failures: 1,
      message: expect.stringContaining("no such table"),
    });

    // One failure doubles the wait: no retry after one interval, a second
    // (failing) one after two, and the next after four more.
    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(errors).toHaveBeenCalledOnce();
    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(errors).toHaveBeenCalledTimes(2);
    expect(logged(1)).toMatchObject({ failures: 2 });

    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("ALTER TABLE players_away RENAME TO players");
    });
    await advanceTime(stub, 4 * FLUSH_INTERVAL_MS - 1);
    expect(await readStoredCount(stub, id)).toBe(0);
    await advanceTime(stub, 1);
    expect(await readStoredCount(stub, id)).toBe(3);
    expect(errors).toHaveBeenCalledTimes(2);

    // Success resets the backoff to the normal interval.
    await stub.increment(id);
    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(await readStoredCount(stub, id)).toBe(4);
  });

  it("caps the retry backoff", async () => {
    const stub = room();
    const id = newPlayerId();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime();

    await runInDurableObject(stub, (instance, state) => {
      instance.increment(id);
      state.storage.sql.exec("ALTER TABLE players RENAME TO players_away");
      instance.flush(); // failure 1
    });
    // Failures 2-6 come after 2, 4, 8, 16 and 32 s.
    for (let n = 1; n <= 5; n++) {
      await advanceTime(stub, FLUSH_INTERVAL_MS * 2 ** n);
    }
    expect(errors).toHaveBeenCalledTimes(6);

    // Uncapped, the next wait would be 64 s.
    await advanceTime(stub, MAX_FLUSH_RETRY_MS);
    expect(errors).toHaveBeenCalledTimes(7);
  });

  it("returns to the normal cadence once a rename writes during backoff", async () => {
    const stub = room();
    const renamed = newPlayerId();
    const clicker = newPlayerId();
    vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime();

    await runInDurableObject(stub, (instance, state) => {
      instance.increment(renamed);
      state.storage.sql.exec("ALTER TABLE players RENAME TO players_away");
      instance.flush(); // failure 1
      instance.flush(); // failure 2: the retry backs off to 4 s
      state.storage.sql.exec("ALTER TABLE players_away RENAME TO players");

      expect(instance.rename(renamed, "Back again")).toMatchObject({
        ok: true,
      });
      // The rename wrote the only dirty count: no backoff timer is left.
      expect(vi.getTimerCount()).toBe(0);
      instance.increment(clicker);
    });

    await advanceTime(stub, FLUSH_INTERVAL_MS);
    expect(await readStoredCount(stub, clicker)).toBe(1);
  });

  it("flushes all dirty players in one transaction", async () => {
    const stub = room();
    const a = newPlayerId();
    const b = newPlayerId();
    vi.spyOn(console, "error").mockImplementation(() => {});
    freezeTime(); // so the failed flush's retry never runs

    await runInDurableObject(stub, (instance, state) => {
      instance.increment(a);
      instance.increment(b);
      // Only b's UPDATE fails, after a's has run.
      state.storage.sql.exec(
        `CREATE TRIGGER fail_b BEFORE UPDATE ON players WHEN NEW.id = '${b}'
         BEGIN SELECT RAISE(ABORT, 'boom'); END`,
      );
      expect(instance.flush()).toBe(0);
      expect(storedCount(state, a)).toBe(0); // rolled back together with b
      state.storage.sql.exec("DROP TRIGGER fail_b");
    });
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
