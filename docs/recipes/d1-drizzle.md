# Recipe: D1 + Drizzle

Relational data in Cloudflare D1 (SQLite), typed with Drizzle ORM, with
migrations applied by CI. Reference implementation: `trevclev0/terminal-quiz`.

## 1. Create the databases

```bash
bunx wrangler d1 create my-app
bunx wrangler d1 create my-app-preview
```

Note both `database_id`s. Add **D1: Edit** to the repo's Cloudflare API token.

## 2. Bind them in `wrangler.jsonc`

Bindings are not inherited by named environments — declare both.

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "my-app",
    "database_id": "<prod-id>",
    // Local dev (miniflare) keys its sqlite file off
    // `preview_database_id ?? database_id`. Keep this stable.
    "preview_database_id": "<preview-id>",
    "migrations_dir": "migrations"
  }
],
"env": {
  "preview": {
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "my-app-preview",
        "database_id": "<preview-id>",
        "migrations_dir": "migrations"
      }
    ]
  }
}
```

Then `bun run cf-typegen` so `Env` gains `DB: D1Database`.

## 3. Install and configure Drizzle

```bash
bun add drizzle-orm
bun add -d drizzle-kit
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
```

`src/shared/schema.ts` is the single source of truth for tables and their
TypeScript types:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Note = typeof notes.$inferSelect;
```

## 4. Scripts

Add to `package.json` (and matching tasks in `mise.toml`):

```json
"migrate:generate": "drizzle-kit generate",
"migrate:local": "wrangler d1 migrations apply my-app --local",
"migrate:preview": "wrangler d1 migrations apply my-app-preview --remote --env preview",
"migrate:prod": "wrangler d1 migrations apply my-app --remote"
```

Workflow: edit `schema.ts` → `bun run migrate:generate` → commit the SQL in
`migrations/` → `bun run migrate:local`. Never hand-edit generated migration
SQL.

drizzle-kit 0.x writes flat files (`migrations/0000_name.sql`), which both
`wrangler d1 migrations apply` and `readD1Migrations()` read as-is. drizzle-kit
1.x nests them (`migrations/<name>/migration.sql`): add
`"migrations_pattern": "*/migration.sql"` to each D1 binding, and check that
your `@cloudflare/vitest-pool-workers` version's `readD1Migrations()` supports
nested layouts before relying on it.

## 5. Expose Drizzle to handlers

`src/worker/types.ts`:

```ts
import type * as schema from "@shared/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    db: DrizzleD1Database<typeof schema>;
  };
};
```

`src/worker/middleware/db.ts`:

```ts
import * as schema from "@shared/schema";
import type { AppEnv } from "@worker/types";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";

export const setupDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});
```

Mount it on the `/api` router in `src/worker/index.ts`
(`new Hono<AppEnv>().use("*", setupDb)...`).

## 6. Apply migrations in CI

In `.github/workflows/deploy.yml`, replace the "Using D1?" comment with:

```yaml
- name: Apply D1 Migrations
  if: github.event_name == 'push' || (github.event_name == 'pull_request' && !github.event.pull_request.head.repo.fork)
  uses: cloudflare/wrangler-action@v4
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: >
      ${{ github.ref == 'refs/heads/main'
        && 'd1 migrations apply my-app --remote'
        || 'd1 migrations apply my-app-preview --remote --env preview'
      }}
```

All preview Workers share the one preview database, so every open PR's
migrations land in it. Keep migrations backward-compatible (expand, then
contract in a later PR): add columns and tables freely, but drop or rename only
once no open PR's code still uses the old shape. If that is too restrictive,
create a D1 database per PR instead and delete it in `preview-cleanup.yml`.

## 7. Integration tests against a real D1

`vitest.config.integration.ts` — pass the migrations in as a binding:

```ts
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

cloudflareTest(async () => ({
  main: "./src/worker/index.ts",
  miniflare: {
    compatibilityDate: "2026-04-27",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {
      ENVIRONMENT: "test",
      TEST_MIGRATIONS: await readD1Migrations("./migrations"),
    },
    d1Databases: { DB: "test-db" },
  },
}));
```

Declare the test-only binding in a `.d.ts` under `src/worker/test-utils/`:

```ts
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: { name: string; queries: string[] }[];
  }
}
```

Apply them per test file (each file gets isolated storage):

```ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
```

Unit tests stay binding-free: mock at the service boundary.
