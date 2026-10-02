# Recipe: Durable Objects (real-time state + WebSockets)

A Durable Object (DO) is a single-threaded instance with its own SQLite
storage, addressed by name. Use one when many clients need to share live,
consistent state — a room, a counter, a game lobby. With the WebSocket
Hibernation API, idle connections cost nothing while the DO sleeps.

> First adopter: Click Rampage. Patterns proven there get folded back into
> this recipe.

## 1. Write the class

`src/worker/durable-objects/Room.ts`:

```ts
import { DurableObject } from "cloudflare:workers";

type Attachment = { playerId: string };

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Runs before any request is delivered — safe place for schema setup.
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)",
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    // The Worker authenticates; the DO trusts only what the Worker passes.
    const playerId = request.headers.get("x-player-id");
    if (!playerId) return new Response("Missing player", { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) opts into hibernation.
    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment({ playerId } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const { playerId } = ws.deserializeAttachment() as Attachment;
    // ...validate `message`, update this.ctx.storage.sql, then broadcast:
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(JSON.stringify({ type: "update", playerId }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    ws.close(code, "closing");
  }
}
```

Per-socket state must go through `serializeAttachment` — instance fields are
lost when the DO hibernates.

## 2. Export it from the Worker entry

`src/worker/index.ts`:

```ts
export { Room } from "@worker/durable-objects/Room";
export default app;
```

## 3. Bind it in `wrangler.jsonc`

`durable_objects` is **not** inherited by named environments; `migrations`
is.

```jsonc
"durable_objects": {
  "bindings": [{ "name": "ROOM", "class_name": "Room" }]
},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["Room"] }],
"env": {
  "preview": {
    "durable_objects": {
      "bindings": [{ "name": "ROOM", "class_name": "Room" }]
    }
  }
}
```

Migrations are append-only: never edit an applied tag; add `v2`, `v3`, … for
new, renamed, or deleted classes. Each per-PR preview Worker is a fresh script,
so it starts from `v1`.

Then `bun run cf-typegen`.

## 4. Route WebSocket upgrades to it

```ts
const api = new Hono<AppEnv>().get("/ws", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected WebSocket upgrade", 426);
  }
  // Same-origin check — browsers always send Origin on WebSocket upgrades.
  const origin = c.req.header("origin");
  if (origin !== new URL(c.req.url).origin) return c.text("Forbidden", 403);

  const playerId = "..."; // from a server-issued HttpOnly cookie
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-player-id", playerId);
  const stub = c.env.ROOM.getByName("global");
  return stub.fetch(new Request(c.req.raw, { headers }));
});
```

Never take identity from a WebSocket message body — derive it in the Worker
and pass it to the DO.

## 5. Test it

In `vitest.config.integration.ts`, bind the class (it is found in `main`):

```ts
miniflare: {
  // ...
  durableObjects: { ROOM: "Room" },
},
```

Drive a socket through the real Worker:

```ts
import { exports } from "cloudflare:workers";

const res = await exports.default.fetch(
  new Request("http://localhost/api/ws", {
    headers: { Upgrade: "websocket", Origin: "http://localhost" },
  }),
);
const ws = res.webSocket;
ws?.accept();
```

Or reach inside an instance with `runInDurableObject(stub, (instance, state)
=> ...)` from `cloudflare:test`.

## Notes

- SQLite-backed DOs are available on the Workers Free plan.
- `bun run dev` runs DOs locally through `@cloudflare/vite-plugin`.
- Docs: <https://developers.cloudflare.com/durable-objects/>
