# Recipe: Better Auth (OAuth sign-in)

Self-hosted OAuth sign-in (e.g. Google + GitHub) on the same Worker, with
sessions stored in D1. **Requires the [D1 + Drizzle recipe](d1-drizzle.md)
first.**

Reference implementation: `trevclev0/terminal-quiz` — the file paths below
point at it.

## Pieces

| Piece | terminal-quiz file | Purpose |
|---|---|---|
| CLI scaffold | `auth.ts` | Input to `npx auth generate`; never imported at runtime |
| Auth tables | `src/shared/authSchema.ts` | Generated Drizzle schema (`user`, `account`, `session`, `verification`) |
| Runtime config | `src/worker/services/auth.ts` | Builds the `betterAuth()` instance from bindings, validates secrets |
| Route | `src/worker/index.ts` | Mounts `auth.handler` at `/api/auth/*` |
| Middleware | `src/worker/middleware/auth.ts` | Resolves the session cookie and sets `user` on the Hono context |
| Client | `src/react-app/api/authClient.ts` | `createAuthClient()` from `better-auth/react` |
| Route guard | `src/react-app/routes/programs/-requireUser.ts` | Redirects to `/login` when signed out |
| Login page | `src/react-app/routes/login.tsx` | Includes `validateReturnTo()` (open-redirect protection) |

## Steps

1. `bun add better-auth`.
2. Copy `auth.ts`, adjust providers, and generate the schema:

   ```bash
   bunx auth generate --adapter drizzle --dialect sqlite \
     --output src/shared/authSchema.ts --yes
   ```

   Add `authSchema.ts` to the `schema` list in `drizzle.config.ts`, then
   `bun run migrate:generate`.
3. Port `src/worker/services/auth.ts` and `src/worker/middleware/auth.ts`.
   Mount `/api/auth/*` before your other API routes.
4. Configure bindings:
   - `wrangler.jsonc` `vars`: `BETTER_AUTH_URL` (top level and `env.preview`).
   - Secrets (`wrangler secret put <NAME>`, and `--env preview`):
     `BETTER_AUTH_SECRET` (≥ 32 chars; `openssl rand -base64 32`),
     `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`,
     `GITHUB_CLIENT_SECRET`.
   - Local: the same keys in `.dev.vars`.
   - `bun run cf-typegen`.
5. Register OAuth apps with each provider. Callback URL:
   `https://<your-domain>/api/auth/callback/<provider>`.
6. Port the client, route guard, and login page.

## Invariants

- Keep the auth tables on their own Drizzle instance; never expose them
  through a generic API or schema introspection.
- `validateReturnTo()` must reject cross-origin, protocol-relative
  (`//evil.com`), and backslash-based `return_to` values.
- Re-verify ownership server-side on every mutation; never trust a
  client-supplied id.
- E2E against previews needs a test bypass (`AUTH_TEST_BYPASS_ENABLED` +
  `AUTH_TEST_BYPASS_SECRET` in terminal-quiz). It must fail closed — never
  enable it based on `ENVIRONMENT !== "production"` alone.

Docs: <https://www.better-auth.com/docs>
