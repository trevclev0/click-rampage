import type { HealthResponse } from "@shared/health";
import type { AppEnv } from "@worker/types";
import { Hono } from "hono";

export const healthRouter = new Hono<AppEnv>().get("/", (c) =>
  c.json<HealthResponse>({
    status: "ok",
    environment: c.env.ENVIRONMENT ?? "unknown",
    timestamp: new Date().toISOString(),
  }),
);
