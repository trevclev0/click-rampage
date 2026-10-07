import { z } from "zod";

/**
 * The WebSocket wire contract between the app and the Room. Both sides
 * import these schemas; never hand-roll message shapes elsewhere.
 */

/** Messages larger than this (UTF-8 bytes) are rejected before parsing. */
export const MAX_MESSAGE_BYTES = 1024;

const encoder = new TextEncoder();

const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("increment") }),
  // Length is enforced by normalizePlayerName on the server; this bound only
  // keeps junk out of the parser.
  z.object({ type: z.literal("rename"), name: z.string().max(200) }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);

export const errorCodes = ["invalid_message", "invalid_name"] as const;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    you: playerSchema,
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
    type: z.literal("error"),
    code: z.enum(errorCodes),
    message: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

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
