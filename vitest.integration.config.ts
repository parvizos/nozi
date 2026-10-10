import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
    globalSetup: ["./vitest.integration.global-setup.ts"],
    include: [
      "apps/**/*.integration.test.ts",
      "packages/**/*.integration.test.ts",
    ],
    maxWorkers: 1,
    passWithNoTests: false,
    restoreMocks: true,
  },
});
