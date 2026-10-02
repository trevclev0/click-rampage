import type { AppEnv } from "@worker/types";
import { createMiddleware } from "hono/factory";

const loggedEnvironments = ["development", "preview", "production"];

// Reuse an upstream request id only if it is short and log-safe; otherwise
// mint our own so clients can't bloat or spoof log correlation ids.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId =
    incoming && REQUEST_ID_PATTERN.test(incoming)
      ? incoming
      : crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
});

/**
 * One structured JSON line per request. Skipped in tests so integration
 * output stays readable.
 */
export const conditionalLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = performance.now();
  await next();
  const durationMs = performance.now() - start;
  if (loggedEnvironments.includes(c.env.ENVIRONMENT || "")) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(durationMs * 100) / 100,
        requestId: c.get("requestId"),
      }),
    );
  }
});
