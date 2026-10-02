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

describe("GET /api/me", () => {
  it("mints an id once and keeps it across requests", async () => {
    const first = await getMe();
    const setCookie = first.headers.get("set-cookie") ?? "";
    const { playerId } = (await first.json()) as MeResponse;

    expect(setCookie).toContain(`cr_player=${playerId}`);

    const second = await getMe(`cr_player=${playerId}`);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(await second.json()).toEqual({ playerId });
  });

  it("replaces a malformed cookie", async () => {
    const response = await getMe("cr_player=not-a-real-id");
    const { playerId } = (await response.json()) as MeResponse;

    expect(playerId).not.toBe("not-a-real-id");
    expect(response.headers.get("set-cookie")).toContain(
      `cr_player=${playerId}`,
    );
  });
});
