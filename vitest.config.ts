import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Permission tests hit a real Postgres — run them serially so the shared
    // scratch org is never torn down under a sibling file.
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      /* `server-only` is a Next.js build-time guard with no runtime module.
         Vitest runs outside Next, so point it at a stub rather than dropping
         the marker from the modules it is protecting. */
      "server-only": path.resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
});
