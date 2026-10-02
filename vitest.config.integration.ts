import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Load the real worker entry point — tests the full Hono stack.
      main: "./src/worker/index.ts",
      miniflare: {
        compatibilityDate: "2026-04-27",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ENVIRONMENT: "test",
        },
        // Add test-only bindings here as the app grows, e.g.
        // d1Databases: { DB: "test-db" } (see docs/recipes/d1-drizzle.md).
      },
    }),
  ],
  resolve: {
    // Mirror the worker-side aliases from vite.config.ts.
    alias: {
      "@shared": fromRoot("./src/shared"),
      "@worker": fromRoot("./src/worker"),
    },
  },
  test: {
    // Backend integration specs only. Frontend specs need happy-dom, not
    // the workerd pool.
    include: ["src/**/*.integration.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    // NOTE: V8 coverage (@vitest/coverage-v8) is incompatible with
    // @cloudflare/vitest-pool-workers — workerd does not support the
    // Node.js inspector protocol V8 coverage needs. Unit-test coverage in
    // vite.config.ts is the single source.
  },
});
