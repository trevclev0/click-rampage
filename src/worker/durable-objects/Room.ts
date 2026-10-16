import { DurableObject } from "cloudflare:workers";
import {
  defaultPlayerName,
  normalizePlayerName,
  type Player,
} from "@shared/player";
import { parseClientMessage, type ServerMessage } from "@shared/protocol";
import { sanitizeErrorText } from "@shared/sanitizeError";
import { isValidPlayerId } from "@worker/middleware/player";
import { PLAYER_ID_HEADER } from "./roomConstants";

/** Increments allowed per socket per second; extra ones are dropped. */
export const MAX_INCREMENTS_PER_SECOND = 20;

/**
 * Longest a click lives only in memory before the Room writes it to SQLite.
 * Each flush writes one row per player who clicked since the last one.
 */
export const FLUSH_INTERVAL_MS = 1000;

/**
 * Per-socket state. Stored with serializeAttachment because instance fields
 * are lost when the Room hibernates.
 */
type SocketAttachment = {
  playerId: string;
  /** Start (ms) of the current one-second rate-limit window. */
  windowStart: number;
  /** Increments accepted in the current window. */
  windowCount: number;
};

type PlayerRow = Pick<Player, "id" | "name" | "count">;

export type RenameResult =
  | { ok: true; player: Player }
  | { ok: false; error: "invalid_name" };

/**
 * The single source of truth for player state. One instance
 * (`ROOM.getByName("global")`) serves every player.
 *
 * Counts are write-back cached. A click updates memory and is broadcast at
 * once; dirty counts reach SQLite at most once per {@link FLUSH_INTERVAL_MS}
 * (one row per player, not per click) and when a player's last socket
 * closes. Writing every click would spend the Workers Free allowance of
 * 100,000 rows written per day in ~83 minutes of one player clicking at
 * the rate limit, after which writes fail until 00:00 UTC.
 *
 * Trade-off: if the instance is evicted or crashes (deploy, restart) before
 * a flush, up to ~1 s of clicks is lost, and clients may already have seen
 * the lost counts. Hibernation does not lose them: a pending flush timer
 * keeps the instance from hibernating until the timer has run.
 *
 * Callers are trusted Worker code: `id` is always the server-issued player
 * id, never a value taken from a client message.
 */
export class Room extends DurableObject<Env> {
  /**
   * Players touched since this instance started, loaded from SQLite on
   * first use. Instance fields vanish on hibernation or eviction, so a
   * count lives only here for at most one flush interval (longer only
   * while flushes are failing).
   */
  #players = new Map<string, Player>();
  /** Cache entries whose count is ahead of SQLite. */
  #dirty = new Set<Player>();
  #flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Runs before any request is delivered to this instance.
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  /** WebSocket upgrades forwarded by `GET /api/ws`. */
  async fetch(request: Request): Promise<Response> {
    const playerId = request.headers.get(PLAYER_ID_HEADER) ?? undefined;
    if (!isValidPlayerId(playerId)) {
      return new Response("Missing player", { status: 400 });
    }

    // A player is "joining" only when this is their first open socket;
    // another tab for an already-online player is silent.
    const alreadyOnline = this.#openSockets(playerId).length > 0;

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) opts into hibernation: idle
    // sockets stay open while the instance sleeps.
    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment({
      playerId,
      windowStart: 0,
      windowCount: 0,
    } satisfies SocketAttachment);

    const you = this.getOrCreatePlayer(playerId);
    send(server, { type: "welcome", you, online: this.#onlinePlayers() });
    if (!alreadyOnline) {
      this.#broadcast({ type: "player_joined", player: you }, server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const message = parseClientMessage(raw);
    if (message === null) {
      send(ws, {
        type: "error",
        code: "invalid_message",
        message: "Message was not valid",
      });
      return;
    }

    // Identity comes only from the socket, never from the message body.
    const attachment = ws.deserializeAttachment() as SocketAttachment;
    const { playerId } = attachment;

    switch (message.type) {
      case "ping":
        send(ws, { type: "pong", t: message.t });
        return;
      case "increment": {
        if (!this.#allowIncrement(ws, attachment)) return;
        const { count } = this.increment(playerId);
        this.#broadcast({ type: "count", id: playerId, count });
        return;
      }
      case "rename": {
        const result = this.rename(playerId, message.name);
        if (!result.ok) {
          send(ws, {
            type: "error",
            code: "invalid_name",
            message: "Names must be 1-20 visible characters",
          });
          return;
        }
        this.#broadcast({
          type: "renamed",
          id: playerId,
          name: result.player.name,
        });
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.#handleDisconnect(ws);
    try {
      // Complete the closing handshake; a no-op if the runtime already did.
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket) {
    this.#handleDisconnect(ws);
  }

  /**
   * Once the player's last socket has gone: flushes now rather than on the
   * next tick, drops them from the cache (so it only grows with who is
   * online) and sends `player_left`.
   */
  #handleDisconnect(ws: WebSocket) {
    const { playerId } = ws.deserializeAttachment() as SocketAttachment;
    const stillOnline = this.#openSockets(playerId).some(
      (other) => other !== ws,
    );
    if (stillOnline) return;

    this.flush();
    const player = this.#players.get(playerId);
    // A failed flush leaves the player dirty; keep them until one succeeds.
    if (player && !this.#dirty.has(player)) this.#players.delete(playerId);
    this.#broadcast({ type: "player_left", id: playerId }, ws);
  }

  /** Fixed one-second window per socket; returns false when over the cap. */
  #allowIncrement(ws: WebSocket, attachment: SocketAttachment): boolean {
    const now = Date.now();
    if (now - attachment.windowStart >= 1000) {
      attachment.windowStart = now;
      attachment.windowCount = 0;
    }
    if (attachment.windowCount >= MAX_INCREMENTS_PER_SECOND) return false;
    attachment.windowCount += 1;
    ws.serializeAttachment(attachment);
    return true;
  }

  /**
   * Accepted sockets that are still OPEN. A closing socket can stay
   * registered briefly, so every presence decision uses this one definition
   * of "online".
   */
  #openSockets(playerId?: string): WebSocket[] {
    return this.ctx
      .getWebSockets(playerId)
      .filter((socket) => socket.readyState === WebSocket.OPEN);
  }

  /** Sends to every open socket, optionally skipping one. */
  #broadcast(message: ServerMessage, except?: WebSocket) {
    const data = JSON.stringify(message);
    for (const socket of this.#openSockets()) {
      if (socket !== except) socket.send(data);
    }
  }

  getOrCreatePlayer(id: string): Player {
    return { ...this.#load(id) };
  }

  /** Counts a click in memory only; {@link Room.flush} persists it. */
  increment(id: string): Player {
    const player = this.#load(id);
    player.count += 1;
    this.#dirty.add(player);
    this.#scheduleFlush();
    return { ...player };
  }

  rename(id: string, requested: string): RenameResult {
    const name = normalizePlayerName(requested);
    if (name === null) return { ok: false, error: "invalid_name" };

    // Renames are rare, so they write through. The row is written anyway,
    // so the pending count rides along at no extra cost.
    const player = this.#load(id);
    this.ctx.storage.sql.exec(
      "UPDATE players SET name = ?, count = ?, updated_at = ? WHERE id = ?",
      name,
      player.count,
      Date.now(),
      id,
    );
    player.name = name;
    this.#dirty.delete(player);
    return { ok: true, player: { ...player } };
  }

  /**
   * Writes every dirty count to SQLite in one transaction, one row per
   * player, and returns the rows written. On failure the counts stay dirty
   * and the next tick retries, so a storage error (such as hitting the
   * daily write limit) delays persistence instead of breaking the Room.
   */
  flush(): number {
    this.#cancelFlush();
    if (this.#dirty.size === 0) return 0;

    try {
      const written = this.ctx.storage.transactionSync(() => {
        const now = Date.now();
        let rows = 0;
        for (const player of this.#dirty) {
          rows += this.ctx.storage.sql.exec(
            "UPDATE players SET count = ?, updated_at = ? WHERE id = ?",
            player.count,
            now,
            player.id,
          ).rowsWritten;
        }
        return rows;
      });
      this.#dirty.clear();
      return written;
    } catch (error) {
      logFlushError(error, this.#dirty.size);
      this.#scheduleFlush();
      return 0;
    }
  }

  /**
   * Arms the flush timer unless one is pending. An in-memory timer, not
   * `setAlarm`: every alarm is billed as a row written, which would undo
   * the batching.
   */
  #scheduleFlush() {
    if (this.#flushTimer !== undefined) return;
    this.#flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  #cancelFlush() {
    if (this.#flushTimer === undefined) return;
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
  }

  /** Players with at least one open socket (several tabs = one player). */
  #onlinePlayers(): Player[] {
    const ids = new Set(
      this.#openSockets().map(
        (ws) => (ws.deserializeAttachment() as SocketAttachment).playerId,
      ),
    );
    return [...ids].map((id) => this.getOrCreatePlayer(id));
  }

  /**
   * The player's cache entry, read from SQLite (and created there if new)
   * on first use. Every read goes through here, so callers always see the
   * in-memory count, never a row that has not been flushed yet.
   */
  #load(id: string): Player {
    const cached = this.#players.get(id);
    if (cached) return cached;

    // Writes rows only for a new player; an ignored insert writes none.
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO players (id, name, count, updated_at) VALUES (?, ?, 0, ?)",
      id,
      defaultPlayerName(id),
      Date.now(),
    );
    const player = this.ctx.storage.sql
      .exec<PlayerRow>("SELECT id, name, count FROM players WHERE id = ?", id)
      .one();
    this.#players.set(id, player);
    return player;
  }
}

function send(ws: WebSocket, message: ServerMessage) {
  ws.send(JSON.stringify(message));
}

/** One structured line per failed flush, like `utils/errorHandler.ts`. */
function logFlushError(error: unknown, pendingPlayers: number) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "room_flush_failed",
      pendingPlayers,
      message: sanitizeErrorText(
        error instanceof Error ? error.message : error,
      ),
    }),
  );
}
