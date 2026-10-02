const config = {
  "*.{js,jsx,ts,tsx}": [
    "bunx biome check --write --no-errors-on-unmatched",
    "bunx vitest related --run",
  ],
  "*.{json,jsonc}": ["bunx biome check --write --no-errors-on-unmatched"],
  "*.{css,scss,less}": ["bunx biome check --write --no-errors-on-unmatched"],
  "*.{md,mdx}": ["bunx biome check --write --no-errors-on-unmatched"],
};

export default config;
