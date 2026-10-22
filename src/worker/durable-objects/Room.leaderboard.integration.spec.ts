import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ServerMessage } from "@shared/protocol";
import {
  connectToRoom,
  drain,
  type TestSocket,
} from "@worker/test-utils/socket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEADERBOARD_INTERVAL_MS, LEADERBOARD_SIZE } from "./Room";

// Each test uses its own Room instance (unique name) so standings and
// timers never leak between tests.
const room = () => env.ROOM.getByName(crypto.randomUUID());
type RoomStub = ReturnType<typeof room>;
// Shaped like the ids the Worker mints: 32 lowercase hex characters.
const newPlayerId = () => crypto.randomUUID().replaceAll("-", "");

/** Stops the clock; the Room runs in the test's isolate, so its timers too. */
const freezeTime = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

const advanceTime = (stub: RoomStub, ms: number) =>
  runInDurableObject(stub, () => {
    vi.advanceTimersByTime(ms);
  });

/** A player who clicked in the past and is not in the Room's cache. */
const addOfflinePlayer = (stub: RoomStub, name: string, count: number) => {
  const id = newPlayerId();
  return runInDurableObject(stub, (_, state) => {
    state.storage.sql.exec(
      "INSERT INTO players (id, name, count, updated_at) VALUES (?, ?, ?, 0)",
      id,
      name,
      count,
    );
    return id;
  });
};

const clicks = async (stub: RoomStub, id: string, times: number) => {
  for (let i = 0; i < times; i++) await stub.increment(id);
};

async function nextOfType<T extends ServerMessage["type"]>(
  socket: TestSocket,
  type: T,
) {
  for (;;) {
    const message = await socket.next();
    if (message.type === type) {
      return message as Extract<ServerMessage, { type: T }>;
    }
  }
}

const leaderboards = async (socket: TestSocket) =>
  (await drain(socket)).filter(({ type }) => type === "leaderboard");

afterEach(() => {
  vi.useRealTimers();
});

describe("Room leaderboard", () => {
  it("includes offline players and clicks not yet flushed", async () => {
    const stub = room();
    const veteran = await addOfflinePlayer(stub, "Veteran", 50);
    const id = newPlayerId();
    await clicks(stub, id, 3);
    await stub.flush();
    // SQLite now holds 3; these two live only in memory.
    await clicks(stub, id, 2);

    expect(await stub.leaderboard(id)).toEqual({
      type: "leaderboard",
      total: 55,
      top: [
        { id: veteran, name: "Veteran", count: 50, rank: 1 },
        { id, name: `Player ${id.slice(0, 4)}`, count: 5, rank: 2 },
      ],
      you: { rank: 2, count: 5 },
    });
  });

  it("leaves out players who have never clicked", async () => {
    const stub = room();
    const idle = newPlayerId();
    await stub.getOrCreatePlayer(idle);
    await addOfflinePlayer(stub, "Clicker", 1);

    const board = await stub.leaderboard(idle);

    expect(board.top.map(({ name }) => name)).toEqual(["Clicker"]);
    expect(board.you).toBeNull();
  });

  it(`lists the top ${LEADERBOARD_SIZE} and ranks you below them`, async () => {
    const stub = room();
    for (let i = 0; i <= LEADERBOARD_SIZE; i++) {
      await addOfflinePlayer(stub, `Pro ${i}`, 100 + i);
    }
    const id = newPlayerId();
    await stub.increment(id);

    const board = await stub.leaderboard(id);

    expect(board.top).toHaveLength(LEADERBOARD_SIZE);
    expect(board.top[0]).toMatchObject({ name: `Pro ${LEADERBOARD_SIZE}` });
    expect(board.you).toEqual({ rank: LEADERBOARD_SIZE + 2, count: 1 });
  });

  it("keeps the total and names current once loaded", async () => {
    const stub = room();
    await addOfflinePlayer(stub, "Veteran", 10);
    const id = newPlayerId();
    expect((await stub.leaderboard(id)).total).toBe(10); // loads standings

    await clicks(stub, id, 3);
    await stub.rename(id, "Speedy");

    const board = await stub.leaderboard(id);
    expect(board.total).toBe(13);
    expect(board.top[1]).toEqual({ id, name: "Speedy", count: 3, rank: 2 });
  });

  it("reloads the same standings after eviction", async () => {
    const name = crypto.randomUUID();
    const stub = env.ROOM.getByName(name);
    await addOfflinePlayer(stub, "Veteran", 10);
    const id = newPlayerId();
    await clicks(stub, id, 4);
    await stub.flush();
    const before = await stub.leaderboard(id);

    await evictDurableObject(stub);

    expect(await env.ROOM.getByName(name).leaderboard(id)).toEqual(before);
  });

  it("writes no rows to load or rank the standings", async () => {
    const stub = room();
    await addOfflinePlayer(stub, "Veteran", 10);
    const id = newPlayerId();

    await runInDurableObject(stub, (instance, state) => {
      const exec = vi.spyOn(state.storage.sql, "exec");
      instance.leaderboard(id);
      const rowsWritten = exec.mock.results.reduce(
        (rows, result) =>
          rows + (result.type === "return" ? result.value.rowsWritten : 0),
        0,
      );
      // It did read (the standings), but wrote nothing.
      expect(exec).toHaveBeenCalled();
      expect(rowsWritten).toBe(0);
    });
  });

  it("sends the standings right after welcome", async () => {
    const stub = room();
    await addOfflinePlayer(stub, "Veteran", 7);
    const socket = await connectToRoom(stub, newPlayerId());

    expect((await socket.next()).type).toBe("welcome");
    expect(await socket.next()).toMatchObject({
      type: "leaderboard",
      total: 7,
      you: null,
    });
  });

  it("pushes at most once per interval, and only after a change", async () => {
    const stub = room();
    const clicker = newPlayerId();
    const watcher = newPlayerId();
    const a = await connectToRoom(stub, clicker);
    await nextOfType(a, "leaderboard");
    const b = await connectToRoom(stub, watcher);
    await nextOfType(b, "leaderboard");
    freezeTime();

    for (let i = 0; i < 3; i++) a.send({ type: "increment" });
    await drain(a);
    expect(await leaderboards(b)).toEqual([]);

    await advanceTime(stub, LEADERBOARD_INTERVAL_MS - 1);
    expect(await leaderboards(b)).toEqual([]);

    await advanceTime(stub, 1);
    // Everyone gets the same top list, each with their own rank.
    expect(await leaderboards(b)).toEqual([
      {
        type: "leaderboard",
        total: 3,
        top: [{ id: clicker, name: expect.any(String), count: 3, rank: 1 }],
        you: null,
      },
    ]);
    expect(await leaderboards(a)).toEqual([
      expect.objectContaining({ you: { rank: 1, count: 3 } }),
    ]);

    // Nothing changed since the push, so nothing more is sent.
    await advanceTime(stub, LEADERBOARD_INTERVAL_MS);
    expect(await leaderboards(b)).toEqual([]);
  });

  /**
   * Makes the standings read fail, as it would past the daily read limit,
   * while every other statement still runs.
   */
  const failStandingsReads = (stub: RoomStub) =>
    runInDurableObject(stub, (_, state) => {
      const { sql } = state.storage;
      const exec = sql.exec.bind(sql);
      vi.spyOn(sql, "exec").mockImplementation((query, ...bindings) => {
        if (query.includes("count > 0")) throw new Error("rows read limit");
        return exec(query, ...bindings);
      });
    });

  it("still lets players join when the standings can't be read", async () => {
    const stub = room();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await failStandingsReads(stub);

    const socket = await connectToRoom(stub, newPlayerId());

    expect((await socket.next()).type).toBe("welcome");
    // The socket works, and no leaderboard came before the pong.
    expect(await leaderboards(socket)).toEqual([]);
    expect(JSON.parse(String(errors.mock.calls[0]?.[0]))).toMatchObject({
      level: "error",
      event: "room_leaderboard_failed",
      message: expect.stringContaining("rows read limit"),
    });
  });

  it("keeps the game running when a push can't read the standings", async () => {
    const stub = room();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await failStandingsReads(stub);
    const id = newPlayerId();
    const socket = await connectToRoom(stub, id);
    await socket.next(); // welcome
    freezeTime();
    socket.send({ type: "increment" });
    await drain(socket);

    await advanceTime(stub, LEADERBOARD_INTERVAL_MS);

    socket.send({ type: "increment" });
    expect(await nextOfType(socket, "count")).toEqual({
      type: "count",
      id,
      count: 2,
    });
  });

  it("skips a push owed after everyone has left", async () => {
    const stub = room();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    // Every standings read fails and logs, so a log means one was tried.
    await failStandingsReads(stub);
    const socket = await connectToRoom(stub, newPlayerId());
    await socket.next(); // welcome
    freezeTime();
    socket.send({ type: "increment" });
    await drain(socket);
    socket.close();
    await runInDurableObject(stub, async () => {}); // close delivered
    errors.mockClear();

    await advanceTime(stub, LEADERBOARD_INTERVAL_MS);

    expect(errors).not.toHaveBeenCalled();
  });

  it("pushes a rename to everyone", async () => {
    const stub = room();
    const id = newPlayerId();
    const socket = await connectToRoom(stub, id);
    await nextOfType(socket, "leaderboard");
    freezeTime();
    socket.send({ type: "increment" });
    socket.send({ type: "rename", name: "Speedy" });
    await drain(socket);

    await advanceTime(stub, LEADERBOARD_INTERVAL_MS);

    const [board] = await leaderboards(socket);
    expect(board).toMatchObject({ top: [{ id, name: "Speedy", count: 1 }] });
  });
});
