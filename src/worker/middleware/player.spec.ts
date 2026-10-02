// @vitest-environment node
import app from "@worker/app";
import { describe, expect, it } from "vitest";
import {
  derivePlayerId,
  isValidPlayerId,
  isValidPlayerToken,
  PLAYER_COOKIE,
} from "./player";

// Generated per run: no hardcoded token-shaped values in the repo.
const TOKEN = crypto.randomUUID();

const request = (cookie?: string, origin = "https://rampage.test") =>
  app.request(
    `${origin}/api/me`,
    cookie ? { headers: { Cookie: `${PLAYER_COOKIE}=${cookie}` } } : {},
    {} as Env,
  );

const mintedToken = (response: Response) =>
  /cr_player=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];

describe("isValidPlayerToken", () => {
  it("accepts a v4 UUID", () => {
    expect(isValidPlayerToken(TOKEN)).toBe(true);
  });

  it.each([undefined, "", "not-a-uuid", `${TOKEN}x`, "x".repeat(500)])(
    "rejects %s",
    (value) => {
      expect(isValidPlayerToken(value)).toBe(false);
    },
  );
});

describe("derivePlayerId", () => {
  it("returns a stable 32-char hex id that differs from the token", async () => {
    const id = await derivePlayerId(TOKEN);

    expect(isValidPlayerId(id)).toBe(true);
    expect(id).not.toContain(TOKEN.slice(0, 8));
    expect(await derivePlayerId(TOKEN)).toBe(id);
    expect(await derivePlayerId(crypto.randomUUID())).not.toBe(id);
  });
});

describe("playerMiddleware", () => {
  it("mints a hardened token cookie on the first request", async () => {
    const response = await request();
    const setCookie = response.headers.get("set-cookie") ?? "";
    const token = mintedToken(response);

    expect(isValidPlayerToken(token)).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/api");
    expect(await response.json()).toEqual({
      playerId: await derivePlayerId(token as string),
    });
  });

  it("reuses a valid token and exposes only the derived id", async () => {
    const response = await request(TOKEN);

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({
      playerId: await derivePlayerId(TOKEN),
    });
  });

  it("treats a public player id pasted into the cookie as invalid", async () => {
    const someonesId = await derivePlayerId(TOKEN);
    const response = await request(someonesId);

    expect(mintedToken(response)).toBeDefined();
    expect(await response.json()).not.toEqual({ playerId: someonesId });
  });

  it.each(["tampered", "x".repeat(500)])(
    "replaces a malformed cookie (%s)",
    async (bad) => {
      const token = mintedToken(await request(bad));

      expect(isValidPlayerToken(token)).toBe(true);
      expect(token).not.toBe(bad);
    },
  );

  it("omits Secure on plain-http localhost (local dev)", async () => {
    const response = await request(undefined, "http://localhost:5173");

    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
