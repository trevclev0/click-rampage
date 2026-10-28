import { DurableObject } from "cloudflare:workers";
import {
  defaultPlayerName,
  normalizePlayerName,
  type Player,
} from "@shared/player";
import {
  type LeaderboardMessage,
  PING_INTERVAL_MS,
  parseClientMessage,
  type ServerMessage,
} from "@shared/protocol";
import { sanitizeErrorText } from "@shared/sanitizeError";
import { isValidPlayerId } from "@worker/middleware/player";
import { PLAYER_ID_HEADER } from "./roomConstants";
import { type RankedPlayer, rankStandings } from "./standings";

/**
 * Increments allowed per player per second, across all their sockets;
 * extra ones are dropped.
 */
export const MAX_INCREMENTS_PER_SECOND = 20;

/**
 * Longest a click lives only in memory before the Room writes it to SQLite.
 * Each flush writes one row per player who clicked since the last one.
 */
export const FLUSH_INTERVAL_MS = 1000;

/**
 * Longest wait between retries while flushes keep failing. Retries back off
 * from {@link FLUSH_INTERVAL_MS}, doubling per consecutive failure, so a Room
 * stuck behind the daily write cap does not retry and log every second.
 */
export const MAX_FLUSH_RETRY_MS = 60_000;

/**
 * A socket with no ping for this long counts as gone. Chrome runs a long
 * hidden tab's timers only once a minute, and as that starts one gap between
 * pings can reach 90 s; this covers it with slack, so such a tab stays online.
 */
export const STALE_SOCKET_MS = 3 * PING_INTERVAL_MS + 30_000;

/** Players listed on the all-time leaderboard. */
export const LEADERBOARD_SIZE = 10;

/**
 * Longest a change waits before the Room pushes new standings. Pushes go
 * out only after a change, so an idle Room sends none.
 */
export const LEADERBOARD_INTERVAL_MS = 5000;

/** Least time between the stale-socket sweeps that pings trigger. */
export const PING_SWEEP_INTERVAL_MS = 10_000;

/**
 * Per-socket state. Stored with serializeAttachment because instance fields
 * are lost when the Room hibernates.
 */
type SocketAttachment = {
  playerId: string;
  /**
   * When the player came online, as a Room-wide sequence number. Every
   * tab of a player carries the same one, so `welcome.online` lists
   * players in the order clients saw `player_joined`.
   */
  joinSeq: number;
  /** When (ms) the client last pinged, or connected if it hasn't yet. */
  lastPing: number;
  /** Set once a sweep has handled this socket as gone. */
  swept?: true;
};

/** A player's fixed one-second rate-limit window. */
type RateWindow = {
  /** Start (ms) of the current window. */
  start: number;
  /** Increments accepted in it. */
  count: number;
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
 * the lost counts. While writes keep failing (e.g. the Free daily write
 * cap), clicks stay only in memory until a flush succeeds, and an eviction
 * then loses all of them. Hibernation does not lose them: a pending flush
 * timer keeps the instance from hibernating, so the Room stays in memory
 * (and is billed duration) for as long as it holds dirty counts.
 *
 * A player gets a row only on their first click or rename, so a visitor who
 * never plays costs no rows written.
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
  /** Flushes failed in a row; sets the retry backoff. */
  #failures = 0;
  /** When #closeStaleSockets last ran. Lost on hibernation, which is fine. */
  #lastSweep = 0;
  /**
   * Rate-limit windows by player id, shared by all of a player's sockets
   * so extra tabs don't add clicks. Kept past a player's leave, so
   * reconnecting doesn't open a fresh window; #closeStaleSockets prunes
   * expired ones. Lost on hibernation, which resets a window at most a
   * second old; a Room holding fresh clicks has a flush pending and stays
   * awake anyway.
   */
  #rateWindows = new Map<string, RateWindow>();
  /**
   * Every player with clicks, offline ones included, for the leaderboard.
   * Loaded from SQLite on first use and kept current by every click and
   * rename after that. With no index on `count` (one would add rows
   * written to every flush), a load scans the whole table: one row read
   * per saved player, including renamers who never clicked, once per wake
   * that needs standings. Lost on hibernation,
   * which is fine: a Room with unflushed clicks never hibernates, so a
   * reload misses nothing.
   */
  #standings: Map<string, Player> | undefined;
  /** Sum of every count in #standings; only meaningful once it's loaded. */
  #total = 0;
  /** #standings sorted, kept until a click or rename changes them. */
  #ranked: RankedPlayer[] | undefined;
  #leaderboardTimer: ReturnType<typeof setTimeout> | undefined;

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

    // Before the presence check: a stale socket of this player's must not
    // make their return look like another tab.
    this.#closeStaleSockets();

    // A player is "joining" only when this is their first open socket;
    // another tab for an already-online player is silent and keeps their
    // place in join order.
    const [tab] = this.#openSockets(playerId);
    const alreadyOnline = tab !== undefined;
    const joinSeq = alreadyOnline
      ? (tab.deserializeAttachment() as SocketAttachment).joinSeq
      : this.#nextJoinSeq();

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) opts into hibernation: idle
    // sockets stay open while the instance sleeps.
    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment({
      playerId,
      joinSeq,
      lastPing: Date.now(),
    } satisfies SocketAttachment);

    const you = this.getOrCreatePlayer(playerId);
    send(server, { type: "welcome", you, online: this.#onlinePlayers() });
    const board = this.#tryLeaderboard(() => this.leaderboard(playerId));
    if (board) send(server, board);
    if (!alreadyOnline) {
      this.#broadcast({ type: "player_joined", player: you }, server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    // Identity comes only from the socket, never from the message body.
    const attachment = ws.deserializeAttachment() as SocketAttachment;
    // A swept socket's client can still deliver what it sent before the
    // Room's close reached it; that socket is already handled as gone. A
    // client closing on its own is different: its last message still counts.
    if (attachment.swept) return;

    const message = parseClientMessage(raw);
    if (message === null) {
      send(ws, {
        type: "error",
        code: "invalid_message",
        message: "Message was not valid",
      });
      return;
    }

    const { playerId } = attachment;

    switch (message.type) {
      case "ping":
        attachment.lastPing = Date.now();
        ws.serializeAttachment(attachment);
        send(ws, { type: "pong", t: message.t });
        // Every client pings, so this sweeps while anyone is connected, with
        // no alarm needed. Throttled, so a busy Room doesn't scan every
        // socket on every ping.
        if (Date.now() - this.#lastSweep >= PING_SWEEP_INTERVAL_MS) {
          this.#closeStaleSockets();
        }
        return;
      case "increment": {
        if (!this.#allowIncrement(playerId)) return;
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
    // A stale tab of the same player would otherwise keep them listed until
    // the next sweep.
    this.#closeStaleSockets();
    try {
      // Complete the closing handshake; a no-op if the runtime already did.
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  /**
   * Not a leave: the runtime calls this for non-disconnection errors, so the
   * socket may still be open. If it isn't, webSocketClose or the stale sweep
   * handles the leave.
   */
  async webSocketError(_ws: WebSocket) {
    this.#closeStaleSockets();
  }

  /**
   * Once the player's last socket has gone: writes their count now rather
   * than on the next tick, drops them from the cache (so it only grows with
   * who is online) and sends `player_left`. Only the leaving player is
   * written; other dirty players wait for the shared timer, so reconnects
   * do not cost every active clicker an extra row. While a failed flush is
   * backing off, the leaver waits for that retry instead, so an outage
   * costs no extra failed write (or error line) per departure.
   */
  #handleDisconnect(ws: WebSocket) {
    const { playerId, swept } = ws.deserializeAttachment() as SocketAttachment;
    if (swept) return;
    const stillOnline = this.#openSockets(playerId).some(
      (other) => other !== ws,
    );
    if (stillOnline) return;

    const player = this.#players.get(playerId);
    if (player && this.#dirty.has(player) && this.#failures === 0) {
      this.#write([player]);
    }
    // A player still dirty stays cached until a write succeeds; `#write`
    // drops them then, once they are offline.
    if (player && !this.#dirty.has(player)) this.#players.delete(playerId);
    this.#broadcast({ type: "player_left", id: playerId }, ws);
  }

  /**
   * Closes sockets that stopped pinging and handles each one as a
   * disconnect. Some sockets never report a close: a half-open connection,
   * a suspended phone tab, or an upgrade the browser abandoned mid-handshake
   * (the Vite dev server then never closes the Room's end). A client that
   * is still there answers the close and reconnects.
   */
  #closeStaleSockets() {
    this.#lastSweep = Date.now();
    for (const [playerId, window] of this.#rateWindows) {
      if (this.#lastSweep - window.start >= 1000) {
        this.#rateWindows.delete(playerId);
      }
    }
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN || !isStale(ws)) continue;
      try {
        ws.close(1001, "No ping");
      } catch {
        // Already closed.
      }
      this.#handleDisconnect(ws);
      // Marked so the close a live client answers with isn't handled twice.
      ws.serializeAttachment({ ...ws.deserializeAttachment(), swept: true });
    }
  }

  /** Fixed one-second window per player; returns false when over the cap. */
  #allowIncrement(playerId: string): boolean {
    const now = Date.now();
    let window = this.#rateWindows.get(playerId);
    if (!window || now - window.start >= 1000) {
      window = { start: now, count: 0 };
      this.#rateWindows.set(playerId, window);
    }
    if (window.count >= MAX_INCREMENTS_PER_SECOND) return false;
    window.count += 1;
    return true;
  }

  /**
   * Accepted sockets that are still OPEN. A closing socket can stay
   * registered briefly, so every presence decision uses this one definition
   * of "online". A stale socket counts until #closeStaleSockets closes it.
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
    this.#standingsChanged(player);
    return { ...player };
  }

  rename(id: string, requested: string): RenameResult {
    const name = normalizePlayerName(requested);
    if (name === null) return { ok: false, error: "invalid_name" };

    // Renames are rare, so they write through, saving a player who hasn't
    // clicked yet so the name lasts. The row is written anyway, so the
    // pending count rides along at no extra cost.
    const player = this.#load(id);
    this.#save({ ...player, name }, Date.now());
    player.name = name;
    this.#dirty.delete(player);
    this.#wrote();
    this.#standingsChanged(player);
    return { ok: true, player: { ...player } };
  }

  /** The all-time standings as `playerId` should see them. */
  leaderboard(playerId?: string): LeaderboardMessage {
    const ranked = this.#rankedStandings();
    return this.#leaderboardFor(
      ranked,
      ranked.find(({ id }) => id === playerId),
    );
  }

  /**
   * Sorts only after a change, so a wave of joins (say, everyone
   * reconnecting after a deploy) doesn't re-sort every past clicker per tab.
   */
  #rankedStandings(): RankedPlayer[] {
    this.#ranked ??= rankStandings(this.#loadStandings().values());
    return this.#ranked;
  }

  #leaderboardFor(
    ranked: RankedPlayer[],
    you: RankedPlayer | undefined,
  ): LeaderboardMessage {
    return {
      type: "leaderboard",
      total: this.#total,
      top: ranked
        .slice(0, LEADERBOARD_SIZE)
        .map(({ id, name, count, rank }) => ({ id, name, count, rank })),
      you: you ? { rank: you.rank, count: you.count } : null,
    };
  }

  /**
   * SQLite's rows with the cache laid over them, since a cached count can
   * be up to a flush ahead of its row.
   */
  #loadStandings(): Map<string, Player> {
    if (this.#standings) return this.#standings;

    const standings = new Map<string, Player>();
    const rows = this.ctx.storage.sql.exec<PlayerRow>(
      "SELECT id, name, count FROM players WHERE count > 0",
    );
    for (const row of rows) standings.set(row.id, row);
    for (const player of this.#players.values()) {
      standings.set(player.id, { ...player });
    }
    this.#total = 0;
    for (const { count } of standings.values()) this.#total += count;
    this.#standings = standings;
    return standings;
  }

  /**
   * Copies a changed player into the standings, if loaded (otherwise the
   * next load reads the change from the cache), and queues a push. With
   * nobody connected there is no one to push to, and a pending timer would
   * only keep the Room awake; whoever connects next gets the standings
   * with their welcome.
   */
  #standingsChanged(player: Player) {
    if (this.#standings) {
      const before = this.#standings.get(player.id)?.count ?? 0;
      this.#total += player.count - before;
      this.#standings.set(player.id, { ...player });
    }
    this.#ranked = undefined;
    if (this.#leaderboardTimer !== undefined) return;
    if (this.#openSockets().length === 0) return;
    this.#leaderboardTimer = setTimeout(() => {
      this.#leaderboardTimer = undefined;
      this.#pushLeaderboard();
    }, LEADERBOARD_INTERVAL_MS);
  }

  /**
   * Runs a leaderboard read, logging and returning null if it fails (say,
   * past the daily rows-read limit), so the board can't take joins or
   * clicks down with it.
   */
  #tryLeaderboard<T>(read: () => T): T | null {
    try {
      return read();
    } catch (error) {
      logRoomError("room_leaderboard_failed", error);
      return null;
    }
  }

  /** Sends every open socket the standings, ranked once, with its own rank. */
  #pushLeaderboard() {
    const sockets = this.#openSockets();
    // Everyone left while the push was pending.
    if (sockets.length === 0) return;
    const ranked = this.#tryLeaderboard(() => this.#rankedStandings());
    if (!ranked) return;
    const rankedById = new Map(ranked.map((player) => [player.id, player]));
    const byPlayer = new Map<string, string>();
    for (const socket of sockets) {
      const { playerId } = socket.deserializeAttachment() as SocketAttachment;
      let data = byPlayer.get(playerId);
      if (data === undefined) {
        data = JSON.stringify(
          this.#leaderboardFor(ranked, rankedById.get(playerId)),
        );
        byPlayer.set(playerId, data);
      }
      socket.send(data);
    }
  }

  /** Writes every dirty count to SQLite now (see `#write`). */
  flush(): number {
    this.#cancelFlush();
    return this.#write([...this.#dirty]);
  }

  /**
   * Writes the players' counts in one transaction, one row per player, and
   * returns the rows written. On failure they stay dirty and a retry is
   * scheduled with backoff, so a storage error (such as hitting the daily
   * write limit) delays persistence instead of breaking the Room.
   */
  #write(players: Player[]): number {
    if (players.length === 0) return 0;

    try {
      const written = this.ctx.storage.transactionSync(() => {
        const now = Date.now();
        let rows = 0;
        for (const player of players) rows += this.#save(player, now);
        return rows;
      });
      for (const player of players) {
        this.#dirty.delete(player);
        // Written after their last socket closed (during an outage): the
        // cache only holds who is online.
        if (this.#openSockets(player.id).length === 0) {
          this.#players.delete(player.id);
        }
      }
      this.#wrote();
      return written;
    } catch (error) {
      this.#failures += 1;
      logRoomError("room_flush_failed", error, {
        pendingPlayers: this.#dirty.size,
        failures: this.#failures,
      });
      // A failed departure write can leave the normal 1 s timer pending;
      // replace it so the retry really backs off.
      this.#cancelFlush();
      this.#scheduleFlush();
      return 0;
    }
  }

  /**
   * After any successful write (a flush, a departure or a rename): storage
   * works again, so drop a long backoff timer and retry the rest on the
   * normal cadence; with nothing dirty, cancel the timer so the Room can
   * hibernate.
   */
  #wrote() {
    if (this.#failures > 0 || this.#dirty.size === 0) this.#cancelFlush();
    this.#failures = 0;
    if (this.#dirty.size > 0) this.#scheduleFlush();
  }

  /**
   * Writes a player's row and returns the rows written: 1 to update it, or
   * 2 (the row and its primary-key index entry) for a player's first save.
   */
  #save(player: Player, now: number): number {
    return this.ctx.storage.sql.exec(
      `INSERT INTO players (id, name, count, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         count = excluded.count,
         updated_at = excluded.updated_at`,
      player.id,
      player.name,
      player.count,
      now,
    ).rowsWritten;
  }

  /**
   * Arms the flush timer unless one is pending, backing off while flushes
   * fail. An in-memory timer, not `setAlarm`: every alarm is billed as a
   * row written, which would undo the batching.
   */
  #scheduleFlush() {
    if (this.#flushTimer !== undefined) return;
    const delay = Math.min(
      FLUSH_INTERVAL_MS * 2 ** this.#failures,
      MAX_FLUSH_RETRY_MS,
    );
    this.#flushTimer = setTimeout(() => this.flush(), delay);
  }

  #cancelFlush() {
    if (this.#flushTimer === undefined) return;
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
  }

  /**
   * Players with at least one open socket (several tabs = one player), in
   * the order they came online. Sorted explicitly: `getWebSockets()`
   * returns sockets in no documented order (newest first, in practice).
   */
  #onlinePlayers(): Player[] {
    const joined = new Map<string, number>();
    for (const ws of this.#openSockets()) {
      const { playerId, joinSeq } =
        ws.deserializeAttachment() as SocketAttachment;
      joined.set(playerId, Math.min(joinSeq, joined.get(playerId) ?? joinSeq));
    }
    return [...joined]
      .sort(([, a], [, b]) => a - b)
      .map(([id]) => this.getOrCreatePlayer(id));
  }

  /**
   * One past the highest join number any socket holds. Read from the
   * attachments rather than kept in a field, which hibernation would reset.
   */
  #nextJoinSeq(): number {
    let next = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const { joinSeq } = ws.deserializeAttachment() as SocketAttachment;
      next = Math.max(next, joinSeq + 1);
    }
    return next;
  }

  /**
   * The player's cache entry, read from SQLite on first use, or a new
   * player with no row yet: `#save` writes one on their first click or
   * rename. Every read goes through here, so callers always see the
   * in-memory count, never a row that has not been flushed yet.
   */
  #load(id: string): Player {
    const cached = this.#players.get(id);
    if (cached) return cached;

    const [row] = this.ctx.storage.sql
      .exec<PlayerRow>("SELECT id, name, count FROM players WHERE id = ?", id)
      .toArray();
    const player = row ?? { id, name: defaultPlayerName(id), count: 0 };
    this.#players.set(id, player);
    return player;
  }
}

function send(ws: WebSocket, message: ServerMessage) {
  // A socket that's closing can't take a reply, and sending would throw.
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

/** Whether a socket has gone {@link STALE_SOCKET_MS} without a ping. */
function isStale(ws: WebSocket): boolean {
  const { lastPing } = ws.deserializeAttachment() as SocketAttachment;
  return Date.now() - lastPing > STALE_SOCKET_MS;
}

/**
 * One structured line per Room storage failure, like
 * `utils/errorHandler.ts`. Flush retries back off, and leaderboard reads
 * happen at most once per join or push, which bounds how often this runs.
 */
function logRoomError(
  event: string,
  error: unknown,
  fields: Record<string, number> = {},
) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event,
      ...fields,
      message: sanitizeErrorText(
        error instanceof Error ? error.message : error,
      ),
    }),
  );
}
