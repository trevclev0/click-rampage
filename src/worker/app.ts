import {
  conditionalLogger,
  requestIdMiddleware,
} from "@worker/middleware/logger";
import { playerMiddleware } from "@worker/middleware/player";
import { healthRouter } from "@worker/routes/health";
import { meRouter } from "@worker/routes/me";
import { wsRouter } from "@worker/routes/ws";
import type { AppEnv } from "@worker/types";
import { formatErrorResponse, logError } from "@worker/utils/errorHandler";
import { Hono } from "hono";

const app = new Hono<AppEnv>();

app.use(requestIdMiddleware);
app.use(conditionalLogger);

app.onError((err, c) => {
  logError(err, c.req.method, c.req.path, c.get("requestId"));
  return c.json(formatErrorResponse(), 500);
});

app.notFound((c) => c.json({ status: "error", code: "NOT_FOUND" }, 404));

// Static assets are served before the worker runs; only /api/* reaches Hono
// (see "run_worker_first" in wrangler.jsonc).
const api = new Hono<AppEnv>()
  .use("*", playerMiddleware)
  .route("/health", healthRouter)
  .route("/me", meRouter)
  .route("/ws", wsRouter);

app.route("/api", api);

export default app;
