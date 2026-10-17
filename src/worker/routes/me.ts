import type { MeResponse } from "@shared/player";
import { playerMiddleware } from "@worker/middleware/player";
import type { AppEnv } from "@worker/types";
import { Hono } from "hono";

export const meRouter = new Hono<AppEnv>().get("/", playerMiddleware, (c) =>
  c.json<MeResponse>({ playerId: c.get("playerId") }),
);
