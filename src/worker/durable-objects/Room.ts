import { DurableObject } from "cloudflare:workers";
import {
  defaultPlayerName,
  normalizePlayerName,
  type Player,
} from "@shared/player";
import { parseClientMessage, type ServerMessage } from "@shared/protocol";
import { isValidPlayerId } from "@worker/middleware/player";
import { PLAYER_ID_HEADER } from "./roomConstants";

/** Increments allowed per socket per second; extra ones are dropped. */
export const MAX_INCREMENTS_PER_SECOND = 20;

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
 * Callers are trusted Worker code: `id` is always the server-issued player
 * id, never a value taken from a client message.
 */
export class Room extends DurableObject<Env> {
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

  /** Sends `player_left` once the player's last socket has gone. */
  #handleDisconnect(ws: WebSocket) {
    const { playerId } = ws.deserializeAttachment() as SocketAttachment;
    const stillOnline = this.#openSockets(playerId).some(
      (other) => other !== ws,
    );
    if (!stillOnline)
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
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO players (id, name, count, updated_at) VALUES (?, ?, 0, ?)",
      id,
      defaultPlayerName(id),
      Date.now(),
    );
    return this.#read(id);
  }

  increment(id: string): Player {
    this.getOrCreatePlayer(id);
    this.ctx.storage.sql.exec(
      "UPDATE players SET count = count + 1, updated_at = ? WHERE id = ?",
      Date.now(),
      id,
    );
    return this.#read(id);
  }

  rename(id: string, requested: string): RenameResult {
    const name = normalizePlayerName(requested);
    if (name === null) return { ok: false, error: "invalid_name" };

    this.getOrCreatePlayer(id);
    this.ctx.storage.sql.exec(
      "UPDATE players SET name = ?, updated_at = ? WHERE id = ?",
      name,
      Date.now(),
      id,
    );
    return { ok: true, player: this.#read(id) };
  }

  /** Players with at least one open socket (several tabs = one player). */
  #onlinePlayers(): Player[] {
    const ids = new Set(
      this.#openSockets().map(
        (ws) => (ws.deserializeAttachment() as SocketAttachment).playerId,
      ),
    );
    return [...ids].map((id) => this.#read(id));
  }

  #read(id: string): Player {
    return this.ctx.storage.sql
      .exec<PlayerRow>("SELECT id, name, count FROM players WHERE id = ?", id)
      .one();
  }
}

function send(ws: WebSocket, message: ServerMessage) {
  ws.send(JSON.stringify(message));
}
