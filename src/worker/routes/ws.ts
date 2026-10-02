import {
  PLAYER_ID_HEADER,
  ROOM_NAME,
} from "@worker/durable-objects/roomConstants";
import type { AppEnv } from "@worker/types";
import { Hono } from "hono";

/**
 * `GET /api/ws` — upgrades to a WebSocket served by the global Room.
 * Identity comes from the player cookie (set by playerMiddleware) and is
 * forwarded in a header the Worker overwrites, so clients can't spoof it.
 */
export const wsRouter = new Hono<AppEnv>().get("/", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ status: "error", code: "UPGRADE_REQUIRED" }, 426);
  }
  // Browsers always send Origin on WebSocket upgrades; anything else is
  // cross-site WebSocket hijacking or a non-browser client.
  if (c.req.header("origin") !== new URL(c.req.url).origin) {
    return c.json({ status: "error", code: "FORBIDDEN" }, 403);
  }

  const headers = new Headers(c.req.raw.headers);
  headers.set(PLAYER_ID_HEADER, c.get("playerId"));
  return c.env.ROOM.getByName(ROOM_NAME).fetch(
    new Request(c.req.raw, { headers }),
  );
});
