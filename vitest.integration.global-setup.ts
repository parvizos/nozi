import {
  assertSafeIntegrationDatabase,
  configureIntegrationTestEnvironment,
} from "./scripts/test-environment";

export default async function setup() {
  Object.assign(process.env, configureIntegrationTestEnvironment());
  assertSafeIntegrationDatabase(process.env);
  const { prisma } = await import("./packages/database/src/index");
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE table_list text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO table_list
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF table_list IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || table_list || ' CASCADE';
      END IF;
    END $$;
  `);
  await prisma.$disconnect();
  const seeded = spawnSync("pnpm", ["db:seed"], {
    env: process.env,
    stdio: "inherit",
  });
  if (seeded.status !== 0) throw new Error("Integration database seed failed");
}
import { spawnSync } from "node:child_process";
