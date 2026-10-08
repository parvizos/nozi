import { beforeAll } from "vitest";

function assertSafeTestDatabase(): void {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Refusing tests: NODE_ENV must be test");
  if (process.env.ALLOW_TEST_DATABASE !== "true")
    throw new Error("Refusing tests: ALLOW_TEST_DATABASE=true is required");
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("Refusing tests: TEST_DATABASE_URL is required");
  const url = new URL(raw);
  const databaseName = url.pathname.replace(/^\//, "");
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const forbiddenNames = new Set([
    "nozi",
    "postgres",
    "template0",
    "template1",
  ]);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !localHosts.has(url.hostname) ||
    forbiddenNames.has(databaseName) ||
    !databaseName.startsWith("nozi_test_")
  ) {
    throw new Error(
      "Refusing tests: use an explicit local nozi_test_* PostgreSQL database",
    );
  }
  process.env.DATABASE_URL = raw;
}

assertSafeTestDatabase();
beforeAll(() => assertSafeTestDatabase());
