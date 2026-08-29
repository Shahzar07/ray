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
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});
