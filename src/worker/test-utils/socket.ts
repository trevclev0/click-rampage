import { exports } from "cloudflare:workers";
import type { ServerMessage } from "@shared/protocol";

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
