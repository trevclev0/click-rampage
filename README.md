# Click Rampage

A real-time multiplayer click counter on Cloudflare Workers. Hit the button,
watch everyone's counts climb live.

Generated from [`trevclev0/cf-starter`](https://github.com/trevclev0/cf-starter):
React + TanStack Router/Query on the front end, Hono on a single Worker, with
a Durable Object for shared real-time state.

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
