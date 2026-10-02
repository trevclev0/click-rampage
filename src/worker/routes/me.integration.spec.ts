import { exports } from "cloudflare:workers";
import type { MeResponse } from "@shared/player";
import { describe, expect, it } from "vitest";

// Through the real worker entry point in workerd.
const getMe = (cookie?: string) =>
  exports.default.fetch(
    new Request("http://localhost/api/me", {
      headers: cookie ? { Cookie: cookie } : {},
    }),
  );

const tokenFrom = (response: Response) =>
  /cr_player=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];

describe("GET /api/me", () => {
  it("mints a token once and keeps the same public id", async () => {
    const first = await getMe();
    const token = tokenFrom(first);
    const { playerId } = (await first.json()) as MeResponse;

    expect(token).toBeDefined();
    expect(playerId).toMatch(/^[0-9a-f]{32}$/);
    expect(playerId).not.toBe(token);

    const second = await getMe(`cr_player=${token}`);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(await second.json()).toEqual({ playerId });
  });

  it("replaces a malformed cookie", async () => {
    const response = await getMe("cr_player=not-a-real-token");

    expect(tokenFrom(response)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
