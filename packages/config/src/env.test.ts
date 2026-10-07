import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

const validEnv = {
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "a-secure-test-secret-that-is-long-enough",
  DATABASE_URL: "postgresql://nozi:test@localhost:5432/nozi_test",
  NODE_ENV: "test",
};

describe("parseServerEnv", () => {
  it("parses a valid test environment with safe defaults", () => {
    expect(parseServerEnv(validEnv)).toMatchObject({
      ALLOW_DEMO_SEED: false,
      LOG_LEVEL: "info",
      NODE_ENV: "test",
      PORT: 3000,
      SESSION_COOKIE_PREFIX: "nozi",
    });
  });

  it("rejects a short authentication secret", () => {
    expect(() => parseServerEnv({ ...validEnv, AUTH_SECRET: "short" })).toThrow(
      "AUTH_SECRET must contain at least 32 characters",
    );
  });

  it("rejects demo accounts in production", () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        ALLOW_DEMO_SEED: "true",
        APP_URL: "https://nozi.example",
        DEMO_USER_PASSWORD: "safe-demo-password",
        NODE_ENV: "production",
      }),
    ).toThrow("ALLOW_DEMO_SEED must be false in production");
  });

  it("requires HTTPS for the production application URL", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, NODE_ENV: "production" }),
    ).toThrow("APP_URL must use HTTPS in production");
  });
});
