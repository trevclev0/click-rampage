// @vitest-environment node
import app from "@worker/index";
import { describe, expect, it } from "vitest";
import { isValidPlayerId, PLAYER_COOKIE } from "./player";

const VALID_ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

const request = (cookie?: string, origin = "https://rampage.test") =>
  app.request(
    `${origin}/api/me`,
    cookie ? { headers: { Cookie: `${PLAYER_COOKIE}=${cookie}` } } : {},
    {} as Env,
  );

const mintedId = (response: Response) =>
  /cr_player=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];

describe("isValidPlayerId", () => {
  it("accepts a v4 UUID", () => {
    expect(isValidPlayerId(VALID_ID)).toBe(true);
  });

  it.each([undefined, "", "not-a-uuid", `${VALID_ID}x`, "x".repeat(500)])(
    "rejects %s",
    (value) => {
      expect(isValidPlayerId(value)).toBe(false);
    },
  );
});

describe("playerMiddleware", () => {
  it("mints a hardened cookie on the first request", async () => {
    const response = await request();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(isValidPlayerId(mintedId(response))).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/api");
    expect(await response.json()).toEqual({ playerId: mintedId(response) });
  });

  it("reuses a valid cookie without setting a new one", async () => {
    const response = await request(VALID_ID);

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ playerId: VALID_ID });
  });

  it.each(["tampered", "x".repeat(500)])(
    "replaces a malformed cookie (%s)",
    async (bad) => {
      const response = await request(bad);
      const id = mintedId(response);

      expect(isValidPlayerId(id)).toBe(true);
      expect(id).not.toBe(bad);
    },
  );

  it("omits Secure on plain-http localhost (local dev)", async () => {
    const response = await request(undefined, "http://localhost:5173");

    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
