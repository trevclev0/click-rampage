import { DurableObject } from "cloudflare:workers";
import {
  defaultPlayerName,
  normalizePlayerName,
  type Player,
} from "@shared/player";

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

  #read(id: string): Player {
    return this.ctx.storage.sql
      .exec<PlayerRow>("SELECT id, name, count FROM players WHERE id = ?", id)
      .one();
  }
}
