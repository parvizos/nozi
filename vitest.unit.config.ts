import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      APP_URL: "http://localhost:3000",
      AUTH_SECRET: "nozi-unit-test-secret-at-least-32-characters",
      DATABASE_URL:
        "postgresql://unit:unit@127.0.0.1:1/nozi_test_unit?schema=public",
      NODE_ENV: "test",
      TRUST_PROXY: "false",
    },
    environment: "node",
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
