import { exports } from "cloudflare:workers";
import { defaultPlayerName } from "@shared/player";
import { derivePlayerId } from "@worker/middleware/player";
import { connect, ORIGIN } from "@worker/test-utils/socket";
import { beforeAll, describe, expect, it } from "vitest";

const TOKEN = crypto.randomUUID();
let PLAYER: string;
beforeAll(async () => {
  PLAYER = await derivePlayerId(TOKEN);
});
const cookie = (token: string) => ({ Cookie: `cr_player=${token}` });

describe("GET /api/ws", () => {
  it("returns 426 without an Upgrade header", async () => {
    const response = await exports.default.fetch(
      new Request(`${ORIGIN}/api/ws`, { headers: { Origin: ORIGIN } }),
    );

    expect(response.status).toBe(426);
  });

  it("returns 403 for a cross-origin upgrade", async () => {
    const response = await exports.default.fetch(
      new Request(`${ORIGIN}/api/ws`, {
        headers: { Upgrade: "websocket", Origin: "https://evil.example" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("welcomes the player with themselves in the online list", async () => {
    const socket = await connect(cookie(TOKEN));

    const welcome = await socket.next();
    expect(welcome).toMatchObject({
      type: "welcome",
      you: { id: PLAYER, name: defaultPlayerName(PLAYER) },
    });
    expect(welcome.type === "welcome" && welcome.online).toContainEqual(
      expect.objectContaining({ id: PLAYER }),
    );
  });

  it("ignores a spoofed player header from the client", async () => {
    const socket = await connect({
      ...cookie(TOKEN),
      "x-click-rampage-player": "a".repeat(32),
    });

    expect(await socket.next()).toMatchObject({ you: { id: PLAYER } });
  });

  it("answers ping with pong", async () => {
    const socket = await connect(cookie(TOKEN));
    await socket.next(); // welcome

    socket.send({ type: "ping", t: 42 });

    expect(await socket.next()).toEqual({ type: "pong", t: 42 });
  });

  it("reports invalid messages and keeps the socket open", async () => {
    const socket = await connect(cookie(TOKEN));
    await socket.next(); // welcome

    socket.send("not json");
    expect(await socket.next()).toMatchObject({
      type: "error",
      code: "invalid_message",
    });

    socket.send({ type: "ping", t: 1 });
    expect(await socket.next()).toEqual({ type: "pong", t: 1 });
  });
});
