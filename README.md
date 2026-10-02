# cf-starter

Template for full-stack TypeScript apps on a single Cloudflare Worker — a
React SPA plus a Hono API, with tests, preview deploys, E2E, and releases
wired up from the first commit.

## What you get

- **App:** React 19 + Vite 8 + TanStack Router (file-based) + TanStack Query,
  CSS Modules with light/dark design tokens.
- **API:** Hono on Cloudflare Workers, mounted under `/api`, with request ids,
  structured JSON logs, and a generic error handler.
- **Hello world:** `GET /api/health` and a home page that calls it, tested at
  every tier.
- **Tests:** Vitest + React Testing Library + MSW (unit), Vitest in workerd
  (integration), Playwright in Chromium and Firefox (E2E).
- **Quality gates:** TypeScript strict, Biome, Husky + lint-staged,
  commitlint (gitmoji + conventional commits), coverage thresholds.
- **CI/CD:** GitHub Actions for CI, production deploys on `main`, a preview
  Worker per PR with E2E against it, preview cleanup on close, and
  semantic-release.
- **Review bots:** Greptile and CodeRabbit configs, Dependabot.
- **Agent docs:** `AGENTS.md` and `CONVENTIONS.md` for AI coding assistants.
- **Recipes:** add D1 + Drizzle, Durable Objects, or Better Auth when a project
  needs them (`docs/recipes/`).

No database or other bindings ship by default.

## Start a new project

1. Click **Use this template** → **Create a new repository**.
2. Follow [`docs/NEW_PROJECT.md`](docs/NEW_PROJECT.md) — rename, Cloudflare
   token, GitHub secrets, branch protection.

## Local development

Prerequisites: [mise](https://mise.jdx.dev) (installs the pinned Bun).

```bash
mise install
eval "$(mise activate)"
bun install
cp .dev.vars.example .dev.vars
bun run dev            # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server with the Worker running in workerd |
| `bun run test --run` | Unit/component tests |
| `bun run test:integration` | Worker integration tests in workerd |
| `bun run coverage` | Unit tests with coverage thresholds |
| `bun run test:e2e` | Playwright against the local dev server |
| `bun run check:code` | Biome lint + format + import sorting (writes fixes) |
| `bun run typecheck` | `tsc -b` across all projects |
| `bun run check` | Build + `wrangler deploy --dry-run` |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` |
| `bun run commit` | Interactive gitmoji commit prompt |

`mise run ci:local` runs the CI checks locally.

## Project structure

See [`AGENTS.md`](AGENTS.md#project-structure).

## License

[MIT](LICENSE)
