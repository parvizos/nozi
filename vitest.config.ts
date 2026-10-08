import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    environment: "node",
    fileParallelism: false,
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
