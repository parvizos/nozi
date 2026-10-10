import { spawnSync } from "node:child_process";

import {
  assertSafeIntegrationDatabase,
  configureIntegrationTestEnvironment,
} from "./test-environment";

const env = configureIntegrationTestEnvironment();
assertSafeIntegrationDatabase(env);

for (const args of [
  ["--filter", "@nozi/database", "exec", "prisma", "migrate", "deploy"],
  ["exec", "vitest", "run", "--config", "vitest.integration.config.ts"],
]) {
  const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
