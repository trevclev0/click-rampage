import type { ServerMessage } from "@shared/protocol";
import { derivePlayerId } from "@worker/middleware/player";
import { connect } from "@worker/test-utils/socket";
import { describe, expect, it } from "vitest";
import { MAX_INCREMENTS_PER_SECOND } from "./Room";

// Every test talks to the shared "global" room through the real worker, so
// each one uses fresh player tokens and only asserts about its own players.
async function newPlayer() {
  const token = crypto.randomUUID();
  return { id: await derivePlayerId(token), cookie: `cr_player=${token}` };
}

async function join(player: { cookie: string }) {
  const socket = await connect({ Cookie: player.cookie });
  const welcome = await socket.next();
  if (welcome.type !== "welcome") throw new Error("expected welcome");
  return { ...socket, welcome };
}

/**
 * Reads messages until the pong for a fresh ping. Messages are delivered in
 * order, so everything returned arrived before the pong — this lets tests
 * assert that something was NOT sent.
 */
async function drain(socket: Awaited<ReturnType<typeof join>>) {
  const t = Math.random();
  socket.send({ type: "ping", t });
  const seen: ServerMessage[] = [];
  for (;;) {
    const message = await socket.next();
    if (message.type === "pong" && message.t === t) return seen;
    seen.push(message);
  }
}

describe("Room game loop", () => {
  it("broadcasts an increment to every connected player", async () => {
    const alice = await newPlayer();
    const bob = await newPlayer();
    const a = await join(alice);
    const b = await join(bob);
    await drain(a); // discard bob's player_joined

    a.send({ type: "increment" });

    const expected = { type: "count", id: alice.id, count: 1 };
    expect(await a.next()).toEqual(expected);
    expect(await b.next()).toEqual(expected);
  });

  it("restores your count when you reconnect", async () => {
    const alice = await newPlayer();
    const first = await join(alice);
    first.send({ type: "increment" });
    first.send({ type: "increment" });
    await drain(first);
    first.close();

    const second = await join(alice);

    expect(second.welcome.you).toMatchObject({ id: alice.id, count: 2 });
  });

  it("broadcasts a valid rename and rejects an invalid one", async () => {
    const alice = await newPlayer();
    const bob = await newPlayer();
    const a = await join(alice);
    const b = await join(bob);
    await drain(a);

    a.send({ type: "rename", name: "  Rage   Clicker " });
    const renamed = { type: "renamed", id: alice.id, name: "Rage Clicker" };
    expect(await a.next()).toEqual(renamed);
    expect(await b.next()).toEqual(renamed);

    a.send({ type: "rename", name: "x".repeat(21) });
    expect(await a.next()).toMatchObject({
      type: "error",
      code: "invalid_name",
    });
    expect(await drain(b)).toEqual([]);
  });

  it("announces joins once per player, not per tab", async () => {
    const watcher = await join(await newPlayer());
    const alice = await newPlayer();

    await join(alice);
    expect(await drain(watcher)).toContainEqual(
      expect.objectContaining({
        type: "player_joined",
        player: expect.objectContaining({ id: alice.id }),
      }),
    );

    await join(alice); // second tab
    expect(await drain(watcher)).toEqual([]);
  });

  it("announces a leave only when the player's last tab closes", async () => {
    const watcher = await join(await newPlayer());
    const alice = await newPlayer();
    const tab1 = await join(alice);
    const tab2 = await join(alice);
    await drain(watcher);

    tab1.close();
    expect(
      (await drain(watcher)).filter((m) => m.type === "player_left"),
    ).toEqual([]);

    tab2.close();
    const left = { type: "player_left", id: alice.id };
    let seen = await drain(watcher);
    // The close is processed asynchronously; give it a couple of round trips.
    for (let i = 0; i < 5 && !seen.some((m) => m.type === "player_left"); i++) {
      seen = await drain(watcher);
    }
    expect(seen).toContainEqual(left);
  });

  it("announces a player again when they reconnect after leaving", async () => {
    const watcher = await join(await newPlayer());
    const alice = await newPlayer();
    const first = await join(alice);
    await drain(watcher);

    first.close();
    // Reconnect immediately, while the old socket may still be closing.
    await join(alice);

    let seen: ServerMessage[] = [];
    for (let i = 0; i < 5; i++) {
      seen = [...seen, ...(await drain(watcher))];
      if (seen.some((m) => m.type === "player_joined")) break;
    }
    const events = seen
      .filter((m) => m.type === "player_left" || m.type === "player_joined")
      .map((m) => m.type);
    // Either the leave was never announced (still online), or it was
    // followed by a fresh join — never a trailing player_left.
    expect(events.at(-1) ?? "player_joined").toBe("player_joined");
  });

  it(`applies at most ${MAX_INCREMENTS_PER_SECOND} increments per second`, async () => {
    const alice = await newPlayer();
    const a = await join(alice);

    for (let i = 0; i < 100; i++) a.send({ type: "increment" });
    const counts = (await drain(a)).filter((m) => m.type === "count");

    // The 100 sends may straddle a window boundary, so allow two windows.
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.length).toBeLessThanOrEqual(2 * MAX_INCREMENTS_PER_SECOND);
    a.close();
    const again = await join(alice);
    expect(again.welcome.you.count).toBe(counts.length);
  });

  it("ignores a forged id in the message body", async () => {
    const alice = await newPlayer();
    const victim = await newPlayer();
    const v = await join(victim);
    const a = await join(alice);
    await drain(v);

    a.send({ type: "increment", id: victim.id });
    a.send({ type: "rename", name: "Hacked", id: victim.id });
    // Order is only guaranteed per socket: drain alice's first so both of
    // her messages are processed before the victim's ping.
    await drain(a);

    const seen = await drain(v);
    expect(seen).toContainEqual({ type: "count", id: alice.id, count: 1 });
    expect(seen).toContainEqual({
      type: "renamed",
      id: alice.id,
      name: "Hacked",
    });
    expect(seen.some((m) => "id" in m && m.id === victim.id)).toBe(false);
  });
});
