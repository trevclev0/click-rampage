import { exports } from "cloudflare:workers";
import { connect, ORIGIN } from "@worker/test-utils/socket";
import { describe, expect, it } from "vitest";

const PLAYER = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const cookie = (id: string) => ({ Cookie: `cr_player=${id}` });

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
    const socket = await connect(cookie(PLAYER));

    const welcome = await socket.next();
    expect(welcome).toMatchObject({
      type: "welcome",
      you: { id: PLAYER, name: "Player 3f2b" },
    });
    expect(welcome.type === "welcome" && welcome.online).toContainEqual(
      expect.objectContaining({ id: PLAYER }),
    );
  });

  it("ignores a spoofed player header from the client", async () => {
    const socket = await connect({
      ...cookie(PLAYER),
      "x-click-rampage-player": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(await socket.next()).toMatchObject({ you: { id: PLAYER } });
  });

  it("answers ping with pong", async () => {
    const socket = await connect(cookie(PLAYER));
    await socket.next(); // welcome

    socket.send({ type: "ping", t: 42 });

    expect(await socket.next()).toEqual({ type: "pong", t: 42 });
  });

  it("reports invalid messages and keeps the socket open", async () => {
    const socket = await connect(cookie(PLAYER));
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
