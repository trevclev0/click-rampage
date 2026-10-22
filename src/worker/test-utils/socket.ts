// Types for `cloudflare:test` in *.integration.spec.ts (workerd pool only).
/// <reference path="../../../node_modules/@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts" />
import { exports } from "cloudflare:workers";
import type { ServerMessage } from "@shared/protocol";
import { PLAYER_ID_HEADER } from "@worker/durable-objects/roomConstants";

export const ORIGIN = "http://localhost";

/**
 * Opens a WebSocket to `/api/ws` through the real worker entry point and
 * buffers what the server sends, so tests can `await next()` in order.
 */
export async function connect(headers: Record<string, string> = {}) {
  const response = await exports.default.fetch(
    new Request(`${ORIGIN}/api/ws`, {
      headers: { Upgrade: "websocket", Origin: ORIGIN, ...headers },
    }),
  );
  return open(response);
}

/**
 * Like {@link connect}, but straight to one Room as `playerId` (the header
 * the Worker would set), so a test can use its own Room instead of sharing
 * the global one.
 */
export async function connectToRoom(
  room: { fetch(request: Request): Promise<Response> },
  playerId: string,
) {
  const response = await room.fetch(
    new Request(`${ORIGIN}/api/ws`, {
      headers: { Upgrade: "websocket", [PLAYER_ID_HEADER]: playerId },
    }),
  );
  return open(response);
}

export type TestSocket = ReturnType<typeof open>;

/** Accepts the client end of an upgrade and queues incoming messages. */
function open(response: Response) {
  const ws = response.webSocket;
  if (!ws) throw new Error(`Upgrade failed with ${response.status}`);
  ws.accept();

  const queue: ServerMessage[] = [];
  const waiters: ((message: ServerMessage) => void)[] = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });

  return {
    ws,
    response,
    close: () => ws.close(1000, "done"),
    send: (data: unknown) =>
      ws.send(typeof data === "string" ? data : JSON.stringify(data)),
    next: () =>
      new Promise<ServerMessage>((resolve) => {
        const queued = queue.shift();
        if (queued) resolve(queued);
        else waiters.push(resolve);
      }),
  };
}

/**
 * Reads messages until the pong for a fresh ping. Messages are delivered in
 * order, so everything returned arrived before the pong — this lets tests
 * assert that something was NOT sent.
 */
export async function drain(socket: TestSocket) {
  const t = Math.random();
  socket.send({ type: "ping", t });
  const seen: ServerMessage[] = [];
  for (;;) {
    const message = await socket.next();
    if (message.type === "pong" && message.t === t) return seen;
    seen.push(message);
  }
}

/**
 * Reads a new socket's `welcome` and the `leaderboard` the Room sends right
 * after it, so a test can go on to whatever follows the join.
 */
export async function nextWelcome(socket: TestSocket) {
  const welcome = await socket.next();
  if (welcome.type !== "welcome") {
    throw new Error(`expected welcome, got ${welcome.type}`);
  }
  const leaderboard = await socket.next();
  if (leaderboard.type !== "leaderboard") {
    throw new Error(`expected leaderboard, got ${leaderboard.type}`);
  }
  return welcome;
}
