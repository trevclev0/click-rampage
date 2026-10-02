import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/react-app/routes",
      generatedRouteTree: "./src/react-app/routeTree.gen.ts",
      quoteStyle: "double",
    }),
    react(),
    ...(process.env.VITEST ? [] : [cloudflare()]),
  ],
  // Keep in sync with the `paths` in tsconfig.app.json / tsconfig.worker.json
  // and the aliases in vitest.config.integration.ts.
  resolve: {
    alias: {
      "@api": fromRoot("./src/react-app/api"),
      "@components": fromRoot("./src/react-app/components"),
      "@hooks": fromRoot("./src/react-app/hooks"),
      "@routes": fromRoot("./src/react-app/routes"),
      "@test-utils": fromRoot("./src/react-app/test-utils"),
      "@shared": fromRoot("./src/shared"),
      "@worker": fromRoot("./src/worker"),
    },
  },
  build: {
    minify: "oxc",
  },
  test: {
    environment: "happy-dom",
    setupFiles: "src/react-app/test-utils/setupTests.ts",
    include: ["src/**/*.spec.{ts,tsx}"],
    // Backend integration specs (*.integration.spec.ts) run in workerd via
    // test:integration, not here.
    exclude: [...configDefaults.exclude, "src/**/*.integration.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
    // restoreMocks does not cover vi.stubGlobal, so a stubbed global
    // (matchMedia, localStorage) would otherwise outlive the test that
    // set it.
    unstubGlobals: true,
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        ...configDefaults.exclude,
        "src/react-app/main.tsx",
        "src/react-app/routeTree.gen.ts",
        "src/react-app/routes/__root.tsx",
        "src/react-app/api/queryClient.ts",
        "src/worker/index.ts",
        "src/worker/app.ts",
        // Durable Objects run only in workerd and are covered by
        // *.integration.spec.ts, which V8 coverage cannot instrument.
        "src/worker/durable-objects/Room.ts",
        "**/*.d.ts",
        "**/test-utils/**",
      ],
      reporter: ["text", "json-summary", "json"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 70,
        lines: 85,
      },
    },
  },
});
