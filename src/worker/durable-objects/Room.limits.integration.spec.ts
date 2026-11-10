import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CLOSE_CODES, type ServerMessage } from "@shared/protocol";
import {
  connectToRoom,
  drain,
  nextWelcome,
  type TestSocket,
} from "@worker/test-utils/socket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEADERBOARD_INTERVAL_MS,
  MAX_MESSAGES_PER_SECOND,
  MAX_RENAMES_PER_MINUTE,
  MAX_SOCKETS_PER_PLAYER,
} from "./Room";

// Each test uses its own Room instance (unique name), so its players are
// the only ones online.
const room = () => env.ROOM.getByName(crypto.randomUUID());
type RoomStub = ReturnType<typeof room>;
// Shaped like the ids the Worker mints: 32 lowercase hex characters.
const newPlayerId = () => crypto.randomUUID().replaceAll("-", "");

async function join(stub: RoomStub, playerId = newPlayerId()) {
  const socket = await connectToRoom(stub, playerId);
  const welcome = await nextWelcome(socket);
  return { ...socket, id: playerId, welcome };
}

/** The code the Room closes `socket` with. */
const closeCode = (socket: TestSocket) =>
  new Promise<number>((resolve) =>
    socket.ws.addEventListener("close", (event) => resolve(event.code)),
  );

const renamed = (messages: ServerMessage[]) =>
  messages.filter((m) => m.type === "renamed");

const errors = (messages: ServerMessage[]) =>
  messages.filter((m) => m.type === "error");

// Only the clock is faked, and it stands still, so no rate window rolls
// over until a test moves it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Room rename limit", () => {
  it(`refuses renames past ${MAX_RENAMES_PER_MINUTE} a minute, and tells only the sender`, async () => {
    const stub = room();
    const watcher = await join(stub);
    const player = await join(stub);
    await drain(watcher); // discard the player's player_joined

    for (let i = 0; i <= MAX_RENAMES_PER_MINUTE; i++) {
      player.send({ type: "rename", name: `Name ${i}` });
    }

    const seen = await drain(player);
    expect(renamed(seen)).toHaveLength(MAX_RENAMES_PER_MINUTE);
    expect(errors(seen)).toEqual([
      expect.objectContaining({ code: "rename_rate_limited" }),
    ]);
    expect(renamed(await drain(watcher))).toHaveLength(MAX_RENAMES_PER_MINUTE);
  });

  it("keeps the name from before a refused rename", async () => {
    const stub = room();
    const player = await join(stub);
    for (let i = 0; i <= MAX_RENAMES_PER_MINUTE; i++) {
      player.send({ type: "rename", name: `Name ${i}` });
    }
    await drain(player);

    expect(await stub.getOrCreatePlayer(player.id)).toMatchObject({
      name: `Name ${MAX_RENAMES_PER_MINUTE - 1}`,
    });
  });

  it("shares one player's limit across their tabs", async () => {
    const stub = room();
    const first = await join(stub);
    for (let i = 0; i < MAX_RENAMES_PER_MINUTE; i++) {
      first.send({ type: "rename", name: `Name ${i}` });
    }
    await drain(first);

    const second = await join(stub, first.id);
    second.send({ type: "rename", name: "One More" });

    expect(errors(await drain(second))).toEqual([
      expect.objectContaining({ code: "rename_rate_limited" }),
    ]);
  });

  it("keeps the limit when the Room loses its memory", async () => {
    const stub = room();
    const player = await join(stub);
    // Timers too: the standings push a rename queues would otherwise keep
    // the Room in memory, as it does for those five seconds in production.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    for (let i = 0; i < MAX_RENAMES_PER_MINUTE; i++) {
      player.send({ type: "rename", name: `Name ${i}` });
    }
    await drain(player);
    await runInDurableObject(stub, () => {
      vi.advanceTimersByTime(LEADERBOARD_INTERVAL_MS);
    });
    vi.useRealTimers();

    // Like hibernation: the Room's fields are gone, the socket stays open.
    await evictDurableObject(stub);
    player.send({ type: "rename", name: "One More" });

    expect(errors(await drain(player))).toEqual([
      expect.objectContaining({ code: "rename_rate_limited" }),
    ]);
  });

  it("allows renames again a minute later", async () => {
    const stub = room();
    const player = await join(stub);
    for (let i = 0; i <= MAX_RENAMES_PER_MINUTE; i++) {
      player.send({ type: "rename", name: `Name ${i}` });
    }
    await drain(player);

    vi.advanceTimersByTime(60_000);
    player.send({ type: "rename", name: "Fresh Start" });

    expect(renamed(await drain(player))).toEqual([
      { type: "renamed", id: player.id, name: "Fresh Start" },
    ]);
  });

  it("gives each player their own limit", async () => {
    const stub = room();
    const spammer = await join(stub);
    const other = await join(stub);
    for (let i = 0; i <= MAX_RENAMES_PER_MINUTE; i++) {
      spammer.send({ type: "rename", name: `Name ${i}` });
    }
    await drain(spammer);
    await drain(other);

    other.send({ type: "rename", name: "Bystander" });

    expect(renamed(await drain(other))).toEqual([
      { type: "renamed", id: other.id, name: "Bystander" },
    ]);
  });
});

describe("Room flood cut-off", () => {
  it(`closes a player who sends more than ${MAX_MESSAGES_PER_SECOND} messages in a second`, async () => {
    const stub = room();
    const watcher = await join(stub);
    const flooder = await join(stub);
    await drain(watcher); // discard the flooder's player_joined
    const closed = closeCode(flooder);

    for (let i = 0; i <= MAX_MESSAGES_PER_SECOND; i++) {
      flooder.send({ type: "increment" });
    }

    expect(await closed).toBe(CLOSE_CODES.flood);
    const seen = await drain(watcher);
    expect(seen.at(-1)).toEqual({ type: "player_left", id: flooder.id });
  });

  it("counts messages the Room can't parse", async () => {
    const stub = room();
    const flooder = await join(stub);
    const closed = closeCode(flooder);

    for (let i = 0; i <= MAX_MESSAGES_PER_SECOND; i++) flooder.send("junk");

    expect(await closed).toBe(CLOSE_CODES.flood);
  });

  it("closes every tab of a player whose tabs flood together", async () => {
    const stub = room();
    const first = await join(stub);
    const second = await join(stub, first.id);
    const closed = Promise.all([closeCode(first), closeCode(second)]);

    for (let i = 0; i <= MAX_MESSAGES_PER_SECOND; i++) {
      (i % 2 === 0 ? first : second).send({ type: "increment" });
    }

    expect(await closed).toEqual([CLOSE_CODES.flood, CLOSE_CODES.flood]);
  });

  it("leaves a player sending exactly the limit connected", async () => {
    const stub = room();
    const player = await join(stub);

    // The drain's ping is the last message the limit allows.
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND - 1; i++) {
      player.send({ type: "increment" });
    }

    expect((await drain(player)).length).toBeGreaterThan(0);
  });

  it("starts a fresh count each second", async () => {
    const stub = room();
    const player = await join(stub);
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND - 1; i++) {
      player.send({ type: "increment" });
    }
    await drain(player);

    vi.advanceTimersByTime(1000);
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND - 1; i++) {
      player.send({ type: "increment" });
    }

    expect((await drain(player)).length).toBeGreaterThan(0);
  });
});

describe("Room tab limit", () => {
  it(`closes a player's oldest tab when they open more than ${MAX_SOCKETS_PER_PLAYER}`, async () => {
    const stub = room();
    const watcher = await join(stub);
    const oldest = await join(stub);
    const closed = closeCode(oldest);
    const others: TestSocket[] = [];
    for (let i = 1; i < MAX_SOCKETS_PER_PLAYER; i++) {
      others.push(await join(stub, oldest.id));
    }

    const extra = await join(stub, oldest.id);

    expect(await closed).toBe(CLOSE_CODES.tooManyTabs);
    // The newest tab works, and the player never looked gone.
    extra.send({ type: "increment" });
    expect(await extra.next()).toEqual({
      type: "count",
      id: oldest.id,
      count: 1,
    });
    const seen = await drain(watcher);
    expect(seen.filter((m) => m.type === "player_left")).toEqual([]);
    expect(seen.filter((m) => m.type === "player_joined")).toHaveLength(1);
    for (const other of others) expect(other.ws.readyState).toBe(1);
  });

  it(`leaves ${MAX_SOCKETS_PER_PLAYER} tabs of one player open`, async () => {
    const stub = room();
    const tabs = [await join(stub)];
    for (let i = 1; i < MAX_SOCKETS_PER_PLAYER; i++) {
      tabs.push(await join(stub, tabs[0].id));
    }

    for (const tab of tabs) expect(await drain(tab)).toEqual([]);
  });

  it("counts tabs per player", async () => {
    const stub = room();
    const first = await join(stub);
    for (let i = 1; i < MAX_SOCKETS_PER_PLAYER; i++) {
      await join(stub, first.id);
    }

    await join(stub); // someone else

    expect(await drain(first)).toEqual([
      expect.objectContaining({ type: "player_joined" }),
    ]);
  });
});
