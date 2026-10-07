import { DurableObject } from "cloudflare:workers";
import {
  defaultPlayerName,
  normalizePlayerName,
  type Player,
} from "@shared/player";
import { parseClientMessage, type ServerMessage } from "@shared/protocol";
import { isValidPlayerId } from "@worker/middleware/player";
import { PLAYER_ID_HEADER } from "./roomConstants";

type SocketAttachment = { playerId: string };

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

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) opts into hibernation: idle
    // sockets stay open while the instance sleeps.
    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment({ playerId } satisfies SocketAttachment);

    const you = this.getOrCreatePlayer(playerId);
    send(server, { type: "welcome", you, online: this.#onlinePlayers() });

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

    switch (message.type) {
      case "ping":
        send(ws, { type: "pong", t: message.t });
        return;
      case "increment":
      case "rename":
        send(ws, {
          type: "error",
          code: "unsupported",
          message: `"${message.type}" is not available yet`,
        });
        return;
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
      this.ctx
        .getWebSockets()
        .map((ws) => (ws.deserializeAttachment() as SocketAttachment).playerId),
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
