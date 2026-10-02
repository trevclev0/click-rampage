import { evictDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// Each test uses its own Room instance (unique name) so state never leaks
// between tests; production always uses the "global" instance.
const room = () => env.ROOM.getByName(crypto.randomUUID());
const PLAYER = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("Room", () => {
  it("creates a new player with a default name and zero count", async () => {
    expect(await room().getOrCreatePlayer(PLAYER)).toEqual({
      id: PLAYER,
      name: "Player 3f2b",
      count: 0,
    });
  });

  it("returns the existing player instead of resetting it", async () => {
    const stub = room();
    await stub.increment(PLAYER);

    expect((await stub.getOrCreatePlayer(PLAYER)).count).toBe(1);
  });

  it("increments counts per player", async () => {
    const stub = room();
    await stub.increment(PLAYER);
    await stub.increment(PLAYER);
    const other = await stub.increment("other-player");

    expect((await stub.getOrCreatePlayer(PLAYER)).count).toBe(2);
    expect(other.count).toBe(1);
  });

  it("renames with a normalized name", async () => {
    const result = await room().rename(PLAYER, "  Rage   Clicker ");

    expect(result).toEqual({
      ok: true,
      player: { id: PLAYER, name: "Rage Clicker", count: 0 },
    });
  });

  it("rejects an invalid name and leaves the player unchanged", async () => {
    const stub = room();
    await stub.rename(PLAYER, "Keep Me");

    expect(await stub.rename(PLAYER, "x".repeat(21))).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect((await stub.getOrCreatePlayer(PLAYER)).name).toBe("Keep Me");
  });

  it("keeps state when the instance is evicted", async () => {
    const name = crypto.randomUUID();
    const stub = env.ROOM.getByName(name);
    await stub.increment(PLAYER);
    await stub.rename(PLAYER, "Survivor");

    await evictDurableObject(stub);

    expect(await env.ROOM.getByName(name).getOrCreatePlayer(PLAYER)).toEqual({
      id: PLAYER,
      name: "Survivor",
      count: 1,
    });
  });
});
