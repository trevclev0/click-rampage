import type { AppEnv } from "@worker/types";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

export const PLAYER_COOKIE = "cr_player";

// Browsers cap cookie lifetime at 400 days.
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

// Ids are minted with crypto.randomUUID(); anything else is treated as
// tampered or corrupt and replaced.
const PLAYER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isValidPlayerId = (value: string | undefined): value is string =>
  value !== undefined && PLAYER_ID_PATTERN.test(value);

/**
 * Identifies the player from an HttpOnly cookie, minting one on first visit.
 * The server is the only source of player identity — never trust an id sent
 * in a request body or header.
 */
export const playerMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const existing = getCookie(c, PLAYER_COOKIE);
  if (isValidPlayerId(existing)) {
    c.set("playerId", existing);
    return next();
  }

  const playerId = crypto.randomUUID();
  c.set("playerId", playerId);
  setCookie(c, PLAYER_COOKIE, playerId, {
    httpOnly: true,
    // HTTPS when deployed; plain-http localhost in `bun run dev`.
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/api",
    maxAge: MAX_AGE_SECONDS,
  });
  await next();
});
