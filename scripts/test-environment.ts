const DEFAULT_TEST_DATABASE_URL =
  "postgresql://nozi:nozi_dev_only@127.0.0.1:5432/nozi_test_local?schema=public";

export function configureIntegrationTestEnvironment(): NodeJS.ProcessEnv {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  return {
    ...process.env,
    ALLOW_DEMO_SEED: "true",
    ALLOW_TEST_DATABASE: "true",
    APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    AUTH_SECRET:
      process.env.AUTH_SECRET ??
      "nozi-integration-test-secret-at-least-32-characters",
    DATABASE_URL: url,
    DEMO_USER_PASSWORD: "NoziIntegrationOnly123!",
    ENABLE_DELIVERY_CODES: "true",
    ENABLE_DEV_OTP_RESPONSE: "true",
    ENABLE_TEST_PAYMENTS: "true",
    NODE_ENV: "test",
    SMS_PROVIDER: "mock",
    TEST_DATABASE_URL: url,
    TRUST_PROXY: "false",
    TURNSTILE_MODE: "disabled",
  };
}

export function assertSafeIntegrationDatabase(env: NodeJS.ProcessEnv): URL {
  if (env.NODE_ENV !== "test")
    throw new Error("Refusing integration tests: NODE_ENV must be test");
  if (env.ALLOW_TEST_DATABASE !== "true")
    throw new Error(
      "Refusing integration tests: ALLOW_TEST_DATABASE=true is required",
    );
  if (!env.TEST_DATABASE_URL)
    throw new Error(
      "Refusing integration tests: TEST_DATABASE_URL is required",
    );
  const url = new URL(env.TEST_DATABASE_URL);
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
    !databaseName.startsWith("nozi_test_") ||
    env.DATABASE_URL !== env.TEST_DATABASE_URL
  ) {
    throw new Error(
      "Refusing integration tests: use the explicit loopback nozi_test_* database as DATABASE_URL",
    );
  }
  return url;
}
