# Coding Conventions

## Environment

- TypeScript strict mode. No `any` — use `unknown` and narrow explicitly.
- Runtime: Cloudflare Workers (not Node.js). Do not use Node-only APIs (`fs`,
  `path`, `process.env` directly, etc.) in `src/worker/`.
- Package manager: Bun. Never suggest npm, yarn, or pnpm commands.
- Linter/formatter: Biome via `bun run check:code`. Do not guess style; let the
  linter enforce it.

## Architecture

- One Cloudflare Worker serves both the React SPA (static assets) and the Hono
  API. Only `/api/*` reaches the Worker (`run_worker_first` in
  `wrangler.jsonc`); everything else is a static asset or the SPA fallback.
- Types shared by the Worker and the app live in `src/shared/`. Never import
  worker code from the app or vice versa — go through `src/shared/`.
- `Env` (bindings) is generated from `wrangler.jsonc` by `bun run cf-typegen`.
  Never hand-edit `worker-configuration.d.ts`; regenerate and commit it. CI
  fails if it is stale.
- Every binding must be declared at the top level **and** in `env.preview` —
  Wrangler does not inherit bindings or `vars` into named environments.

## Frontend

- React functional components only. No class components.
- TanStack Router for all routing. Use `createFileRoute`; do not use manual
  route objects.
- Named exports preferred. Default exports only where TanStack Router
  file-based routing requires.
- All styling must use CSS Modules (`ComponentName.module.css`) co-located with
  the component. No inline `style={}` props or CSS-in-JS libraries. Design
  tokens (colors, spacing, radius, fonts) live as custom properties in
  `src/react-app/index.css`.
- Do not use `useEffect` for data fetching — use TanStack Query (`useQuery`,
  `useMutation`). Fetch functions live in `src/react-app/api/`, hooks in
  `src/react-app/hooks/`.
- Set `staleTime` intentionally per query based on how fresh that data needs to
  be; do not lean on the app-wide default.

## Backend

- Hono for all API routes, mounted under `/api` in `src/worker/index.ts`. One
  router per file in `src/worker/routes/`.
- Keep route handlers thin — business logic belongs in service functions.
- Validate all inputs at the handler layer before touching storage.
- Errors: throw, and let `app.onError` log a structured line and return a
  generic body. Never put internal error details in a response.

## Code style

- Prefer early returns over nested conditionals.
- Logging on Workers: `console.log`/`console.error` to stdout **is** the
  sanctioned transport — Workers Logs reads stdout. Emit structured JSON lines
  (see `src/worker/middleware/logger.ts` and `src/worker/utils/errorHandler.ts`),
  gate noisy request logs by environment, and do not leave stray ad-hoc
  `console.log` calls in committed code.
- Imports: Biome handles organization. Do not manually sort.
- No barrel files (`index.ts` re-exports) unless already established in that
  directory.
- Double quotes for JS/TS strings.
- 2-space indentation, LF line endings, UTF-8, final newline (`.editorconfig`).
- Max line length: 80 characters.
- Markdown fenced code blocks must declare a language (e.g. `` ```text ``,
  `` ```bash ``, `` ```tsx ``). No bare `` ``` `` fences.
- TypeScript strict mode plus `noUnusedLocals`, `noUnusedParameters`, etc. — do
  not disable these.

## Testing

- Vitest only. No Jest APIs.
- Co-locate tests with source: `foo.spec.ts` next to `foo.ts`.
- Unit tests never use real Workers bindings — drive Hono with
  `app.request(path, init, env)` and a hand-built env, or mock at the service
  boundary.
- Every network request in a unit test must hit an MSW handler. The global
  server in `src/react-app/test-utils/setupTests.ts` fails any unhandled
  request. Override per test with `server.use(...)`.
- Backend behaviour that depends on the real runtime goes in
  `*.integration.spec.ts` (runs in workerd via `bun run test:integration`).

## Git

- Conventional commits with gitmoji prefix. Format:
  `<emoji> <type>(<scope>): <description>`.
- Never commit directly to `main`. Feature branches only.
- Scope: always lowercase and kebab-case (e.g. `health-check`, not
  `healthCheck`), never a file extension, and the logical module name rather
  than the filename.

## Build Verification

After all edits are complete, run `bun run check` to verify the build and a
dry-run deploy pass. If it fails, fix the issues before moving on.

## What NOT to do

- Do not install new dependencies without asking first.
- Do not add barrel files speculatively.
- Do not hand-edit generated files (`routeTree.gen.ts`,
  `worker-configuration.d.ts`).
