/**
 * Hono generics for this worker. `Env` is generated from wrangler.jsonc by
 * `bun run cf-typegen` (worker-configuration.d.ts) — add bindings there, not
 * here.
 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    /** Server-issued anonymous player id (see middleware/player.ts). */
    playerId: string;
  };
};
