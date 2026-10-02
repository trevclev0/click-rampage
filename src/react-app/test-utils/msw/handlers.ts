import type { HealthResponse } from "@shared/health";
import { HttpResponse, http } from "msw";

export const mockHealth = (
  overrides: Partial<HealthResponse> = {},
): HealthResponse => ({
  status: "ok",
  environment: "test",
  timestamp: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/** Default happy-path handlers. Override per test with `server.use(...)`. */
export const handlers = [
  http.get("/api/health", () => HttpResponse.json(mockHealth())),
];
