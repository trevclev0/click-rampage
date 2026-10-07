// @vitest-environment node
import app from "@worker/app";
import { PLAYER_ID_HEADER } from "@worker/durable-objects/roomConstants";
import { derivePlayerId } from "@worker/middleware/player";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://rampage.test";
const TOKEN = crypto.randomUUID();

function setup() {
  const fetch = vi.fn(async (_request: Request) => new Response("from room"));
  const getByName = vi.fn(() => ({ fetch }));
  const env = { ROOM: { getByName } } as unknown as Env;
  const request = (headers: Record<string, string>) =>
    app.request(`${ORIGIN}/api/ws`, { headers }, env);
  return { fetch, getByName, request };
}

describe("GET /api/ws", () => {
  it("requires a WebSocket upgrade", async () => {
    const { request, fetch } = setup();

    const response = await request({ Origin: ORIGIN });

    expect(response.status).toBe(426);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{}, { Origin: "https://evil.example" }])(
    "rejects a missing or foreign Origin (%j)",
    async (origin) => {
      const { request, fetch } = setup();

      const response = await request({ Upgrade: "websocket", ...origin });

      expect(response.status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("forwards to the global room with the cookie's player id", async () => {
    const { request, fetch, getByName } = setup();

    const response = await request({
      Upgrade: "websocket",
      Origin: ORIGIN,
      Cookie: `cr_player=${TOKEN}`,
      [PLAYER_ID_HEADER]: "spoofed-by-client",
    });

    expect(await response.text()).toBe("from room");
    expect(getByName).toHaveBeenCalledWith("global");
    const [forwarded] = fetch.mock.calls[0];
    expect(forwarded.headers.get(PLAYER_ID_HEADER)).toBe(
      await derivePlayerId(TOKEN),
    );
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("passes the cookie minted on a first visit through", async () => {
    const { request, fetch } = setup();

    const response = await request({ Upgrade: "websocket", Origin: ORIGIN });

    expect(await response.text()).toBe("from room");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    const token = /^cr_player=([^;]+)/.exec(cookies[0])?.[1] ?? "";
    const [forwarded] = fetch.mock.calls[0];
    expect(forwarded.headers.get(PLAYER_ID_HEADER)).toBe(
      await derivePlayerId(token),
    );
  });
});
