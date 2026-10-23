import { z } from "zod";

/**
 * The WebSocket wire contract between the app and the Room. Both sides
 * import these schemas; never hand-roll message shapes elsewhere.
 */

/** Messages larger than this (UTF-8 bytes) are rejected before parsing. */
export const MAX_MESSAGE_BYTES = 1024;

/**
 * Longest `rename.name` the parser accepts, in UTF-16 code units. The real
 * limit is normalizePlayerName's visible length on the server; this bound
 * only keeps junk out of the parser.
 */
export const MAX_RENAME_UNITS = 200;

/**
 * How often a client pings the Room. The Room treats a socket that stops
 * pinging as gone, so both sides share this.
 */
export const PING_INTERVAL_MS = 30_000;

const encoder = new TextEncoder();

const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});

/** A player with at least one click, ranked by all-time count. */
const leaderboardEntrySchema = playerSchema.extend({
  count: z.number().int().positive(),
  /** Tied players share a rank (1, 2, 2, 4). */
  rank: z.number().int().positive(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("increment") }),
  z.object({
    type: z.literal("rename"),
    name: z.string().max(MAX_RENAME_UNITS),
  }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);

export const errorCodes = ["invalid_message", "invalid_name"] as const;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    you: playerSchema,
    /** Everyone online, you included, in the order they joined. */
    online: z.array(playerSchema),
  }),
  z.object({ type: z.literal("player_joined"), player: playerSchema }),
  z.object({ type: z.literal("player_left"), id: z.string() }),
  z.object({
    type: z.literal("count"),
    id: z.string(),
    count: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("renamed"), id: z.string(), name: z.string() }),
  z.object({ type: z.literal("pong"), t: z.number() }),
  z.object({
    type: z.literal("leaderboard"),
    /** Every click ever counted in the room, offline players included. */
    total: z.number().int().nonnegative(),
    /** The top players, best first. */
    top: z.array(leaderboardEntrySchema),
    /** The receiving player's place; null until they have clicked. */
    you: leaderboardEntrySchema.pick({ rank: true, count: true }).nullable(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.enum(errorCodes),
    message: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardMessage = Extract<
  ServerMessage,
  { type: "leaderboard" }
>;

/** Parses a raw client frame; `null` means oversized, non-JSON or invalid. */
export function parseClientMessage(
  raw: string | ArrayBuffer,
): ClientMessage | null {
  if (typeof raw !== "string") return null;
  // Cheap pre-check first: UTF-8 never uses fewer bytes than UTF-16 units.
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  if (encoder.encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** Parses a raw server frame on the client; `null` means non-JSON or invalid. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = serverMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}
