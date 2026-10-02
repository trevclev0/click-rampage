// @vitest-environment node
import app from "@worker/index";
import { describe, expect, it, vi } from "vitest";

// Unit-level: drives the Hono app directly with a hand-built env. The
// integration spec covers the same route inside workerd.
const request = (
  path: string,
  env: { ENVIRONMENT?: string },
  init?: RequestInit,
) => app.request(path, init, env as unknown as Env);

describe("GET /api/health", () => {
  it("reports the environment from the binding", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await request("/api/health", {
      ENVIRONMENT: "production",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      environment: "production",
    });
  });

  it("reuses an incoming x-request-id", async () => {
    const response = await request(
      "/api/health",
      {},
      { headers: { "x-request-id": "req-abc" } },
    );

    expect(response.headers.get("x-request-id")).toBe("req-abc");
  });

  it("replaces an unsafe or oversized x-request-id", async () => {
    for (const unsafe of ["a b", "x".repeat(129), "<script>"]) {
      const response = await request(
        "/api/health",
        {},
        { headers: { "x-request-id": unsafe } },
      );

      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("logs one structured line per request in deployed environments", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await request("/api/health", { ENVIRONMENT: "preview" });

    expect(logSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({
      level: "info",
      method: "GET",
      path: "/api/health",
      status: 200,
    });
  });

  it("does not log outside deployed environments", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await request("/api/health", { ENVIRONMENT: "test" });

    expect(logSpy).not.toHaveBeenCalled();
  });
});
