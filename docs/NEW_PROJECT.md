# Starting a New Project

Checklist for turning a fresh copy of this template into a real project.
Replace `my-app` with your project's name throughout.

## 1. Create the repo

On GitHub: **Use this template** → **Create a new repository**. Install the
GitHub Apps you use on it (Claude, Greptile, CodeRabbit, and your release app —
see step 4).

## 2. Rename

| File | Change |
|---|---|
| `package.json` | `"name"` → `my-app`; leave `"version"` at `0.0.0` |
| `wrangler.jsonc` | `"name"` → `my-app` |
| `.github/workflows/deploy.yml` | `PREVIEW_PREFIX` → `my-app-preview-pr` |
| `.github/workflows/preview-cleanup.yml` | `PREVIEW_PREFIX` → `my-app-preview-pr` |
| `index.html`, `public/favicon.svg` | Title (and icon) |
| `src/react-app/routes/index.tsx` | Replace the hello-world page |
| `AGENTS.md` | Rewrite **Project Overview**; update the Worker names in **Environments & Deployment** |
| `greptile.json`, `.coderabbit.yaml` | Add project-specific rules as they emerge |
| `README.md` | Describe the project |

Then:

```bash
bun install
bun run cf-typegen   # regenerate worker-configuration.d.ts
bun run check        # build + dry-run deploy
```

The production build output directory follows the Worker name
(`dist/my_app/`); nothing in the template hardcodes it.

## 3. Cloudflare

You need your **account ID** and an **API token** for the new repo.

- **Account ID** — `dash.cloudflare.com` puts it in the URL
  (`dash.cloudflare.com/<account-id>/...`); it is also on the Workers & Pages
  overview. One account ID covers every project.
- **API token** — one per repo, so each can be revoked on its own.
  Dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare
  Workers** template:
  - Account resources: your account.
  - Zone resources: the zone of your custom domain (only if you use one).
  - Add **D1: Edit** only if the project uses D1.

## 4. GitHub Actions secrets and variables

Repo → Settings → Secrets and variables → Actions:

| Name | Kind | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Secret | Token from step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Account ID from step 3 |
| `RELEASE_APP_CLIENT_ID` | Variable | Client ID of your release GitHub App |
| `RELEASE_APP_PRIVATE_KEY` | Secret | Private key of your release GitHub App |

The release app lets semantic-release push the version commit and tag to a
protected `main`. One app can serve every repo: install it on the new repo and
reuse the same client ID and key.

## 5. Branch protection on `main`

Settings → Rules → Rulesets → New branch ruleset targeting `main`:

- Require a pull request before merging.
- Require status checks: `lint-and-test`, `integration-test`, `commitlint`,
  `deploy`, `e2e`.
- Add the release GitHub App to the bypass list.

## 6. Custom domain (optional)

Once the domain is on the Cloudflare account, in `wrangler.jsonc` set
`"workers_dev": false` and add:

```jsonc
"routes": [{ "pattern": "my-app.example.com", "custom_domain": true }]
```

Keep `env.preview` on `workers.dev` (`"workers_dev": true, "routes": []`).

## 7. First PR

Open a PR with your first change. You should see CI, a preview deployment
with its URL on the PR, E2E against it, and a semantic-release dry run. On
merge, production deploys and the first release is cut.

## Adding a data layer

See `docs/recipes/`:

- [`d1-drizzle.md`](recipes/d1-drizzle.md) — relational data in D1 via Drizzle.
- [`durable-object.md`](recipes/durable-object.md) — real-time state and
  WebSockets.
- [`better-auth.md`](recipes/better-auth.md) — OAuth sign-in (needs D1).
