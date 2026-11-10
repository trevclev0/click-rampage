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
  const limit = vi.fn(async (_options: { key: string }) => ({
    success: true,
  }));
  const env = {
    ROOM: { getByName },
    WS_RATE_LIMITER: { limit },
  } as unknown as Env;
  const request = (headers: Record<string, string>) =>
    app.request(`${ORIGIN}/api/ws`, { headers }, env);
  return { fetch, getByName, limit, request };
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

  it("refuses an address over the connection limit before reaching the Room", async () => {
    const { request, fetch, limit } = setup();
    limit.mockResolvedValue({ success: false });

    const response = await request({
      Upgrade: "websocket",
      Origin: ORIGIN,
      "CF-Connecting-IP": "203.0.113.7",
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      status: "error",
      code: "RATE_LIMITED",
    });
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("doesn't count requests it would refuse anyway", async () => {
    const { request, limit } = setup();

    await request({ Origin: ORIGIN });
    await request({ Upgrade: "websocket", Origin: "https://evil.example" });

    expect(limit).not.toHaveBeenCalled();
  });

  // Cloudflare always reports the client's address, so these are local
  // dev and tests, where every connection would share one allowance.
  it.each<Record<string, string>>([
    {},
    { "CF-Connecting-IP": "127.0.0.1" },
    { "CF-Connecting-IP": "::1" },
  ])("doesn't limit a local connection (%j)", async (address) => {
    const { request, limit } = setup();
    limit.mockResolvedValue({ success: false });

    const response = await request({
      Upgrade: "websocket",
      Origin: ORIGIN,
      ...address,
    });

    expect(await response.text()).toBe("from room");
    expect(limit).not.toHaveBeenCalled();
  });

  it("still connects when the limiter itself fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { request, limit } = setup();
    limit.mockRejectedValue(new Error("limiter down"));

    const response = await request({
      Upgrade: "websocket",
      Origin: ORIGIN,
      "CF-Connecting-IP": "203.0.113.7",
    });

    expect(await response.text()).toBe("from room");
    expect(JSON.parse(String(errors.mock.calls[0]?.[0]))).toMatchObject({
      level: "error",
      event: "ws_rate_limit_failed",
    });
  });
});
