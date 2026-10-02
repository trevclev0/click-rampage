import { exports } from "cloudflare:workers";
import type { HealthResponse } from "@shared/health";
import { describe, expect, it } from "vitest";

// Runs in workerd against the real worker entry point (index.ts), so the
// whole Hono middleware stack is exercised.
const request = (path: string) =>
  exports.default.fetch(new Request(`http://localhost${path}`));

describe("GET /api/health", () => {
  it("returns ok with the configured environment", async () => {
    const response = await request("/api/health");

    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(body.environment).toBe("test");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("echoes a request id header", async () => {
    const response = await request("/api/health");

    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));
  });
});

describe("unknown /api routes", () => {
  it("return a JSON 404", async () => {
    const response = await request("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      status: "error",
      code: "NOT_FOUND",
    });
  });
});
