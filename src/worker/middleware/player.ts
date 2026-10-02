import type { AppEnv } from "@worker/types";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

export const PLAYER_COOKIE = "cr_player";

// Browsers cap cookie lifetime at 400 days.
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

// The cookie holds a secret token minted with crypto.randomUUID(); anything
// else is treated as tampered or corrupt and replaced.
const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The public player id: 128 bits of the token's SHA-256, as lowercase hex.
const PLAYER_ID_PATTERN = /^[0-9a-f]{32}$/;

export const isValidPlayerToken = (
  value: string | undefined,
): value is string => value !== undefined && TOKEN_PATTERN.test(value);

export const isValidPlayerId = (value: string | undefined): value is string =>
  value !== undefined && PLAYER_ID_PATTERN.test(value);

/**
 * Derives the public player id from the secret cookie token. The id is shown
 * to every player; the token never leaves the cookie. Because the hash can't
 * be reversed, seeing someone's id doesn't let you act as them.
 */
export async function derivePlayerId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Identifies the player from an HttpOnly cookie, minting a token on first
 * visit. The server is the only source of player identity — never trust an
 * id sent in a request body or header.
 */
export const playerMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const existing = getCookie(c, PLAYER_COOKIE);
  if (isValidPlayerToken(existing)) {
    c.set("playerId", await derivePlayerId(existing));
    return next();
  }

  const token = crypto.randomUUID();
  c.set("playerId", await derivePlayerId(token));
  setCookie(c, PLAYER_COOKIE, token, {
    httpOnly: true,
    // HTTPS when deployed; plain-http localhost in `bun run dev`.
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/api",
    maxAge: MAX_AGE_SECONDS,
  });
  await next();
});
