import { sanitizeErrorText } from "@shared/sanitizeError";
import {
  PLAYER_ID_HEADER,
  ROOM_NAME,
} from "@worker/durable-objects/roomConstants";
import { playerMiddleware } from "@worker/middleware/player";
import type { AppEnv } from "@worker/types";
import { Hono } from "hono";

const LOOPBACK = new Set(["127.0.0.1", "::1"]);

/**
 * `GET /api/ws` — upgrades to a WebSocket served by the global Room.
 * Identity comes from the player cookie (set by playerMiddleware) and is
 * forwarded in a header the Worker overwrites, so clients can't spoof it.
 * Upgrades are rate-limited per address.
 */
export const wsRouter = new Hono<AppEnv>().get(
  "/",
  playerMiddleware,
  async (c) => {
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return c.json({ status: "error", code: "UPGRADE_REQUIRED" }, 426);
    }
    // Browsers always send Origin on WebSocket upgrades; anything else is
    // cross-site WebSocket hijacking or a non-browser client.
    if (c.req.header("origin") !== new URL(c.req.url).origin) {
      return c.json({ status: "error", code: "FORBIDDEN" }, 403);
    }

    // Every upgrade costs a Durable Object request, so an address opening
    // them in a loop is stopped here, before the Room is reached. The limit
    // (wrangler.jsonc) is per address, which a classroom or office shares.
    // Cloudflare always sets the header to the real client address, so a
    // missing or loopback one is local dev or a test, where every
    // connection would share a single allowance.
    const address = c.req.header("cf-connecting-ip");
    if (
      address !== undefined &&
      !LOOPBACK.has(address) &&
      !(await allowConnection(c.env.WS_RATE_LIMITER, address))
    ) {
      return c.json({ status: "error", code: "RATE_LIMITED" }, 429);
    }

    const headers = new Headers(c.req.raw.headers);
    headers.set(PLAYER_ID_HEADER, c.get("playerId"));
    const upgrade = await c.env.ROOM.getByName(ROOM_NAME).fetch(
      new Request(c.req.raw, { headers }),
    );

    // Returning the Room's response as-is would drop the cookie that
    // playerMiddleware minted on a first visit, so the next reconnect would
    // arrive as a new player. Copy it onto the 101, keeping the socket.
    const responseHeaders = new Headers(upgrade.headers);
    for (const cookie of c.res.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", cookie);
    }
    return new Response(upgrade.body, {
      status: upgrade.status,
      statusText: upgrade.statusText,
      headers: responseHeaders,
      webSocket: upgrade.webSocket,
    });
  },
);

/**
 * Whether `address` may open another socket. A limiter that fails lets the
 * connection through: the Room has its own limits, and an outage in the
 * limiter shouldn't take the game down with it.
 */
async function allowConnection(
  limiter: RateLimit,
  address: string,
): Promise<boolean> {
  try {
    return (await limiter.limit({ key: address })).success;
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "ws_rate_limit_failed",
        message: sanitizeErrorText(
          error instanceof Error ? error.message : error,
        ),
      }),
    );
    return true;
  }
}
