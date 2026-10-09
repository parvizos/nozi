import { afterEach, describe, expect, it } from "vitest";

import { resetEnvCacheForTests } from "@nozi/config";

import { getTrustedClientIp } from "./request-ip";

const original = process.env.TRUST_PROXY;

afterEach(() => {
  process.env.TRUST_PROXY = original ?? "false";
  resetEnvCacheForTests();
});

describe("trusted proxy resolution", () => {
  it("ignores forwarded headers unless Cloudflare trust is explicit", () => {
    process.env.TRUST_PROXY = "false";
    resetEnvCacheForTests();
    expect(
      getTrustedClientIp(
        new Headers({
          "cf-connecting-ip": "203.0.113.4",
          "x-forwarded-for": "198.51.100.2",
        }),
      ),
    ).toBeNull();
  });

  it("uses only the Cloudflare header in Cloudflare mode", () => {
    process.env.TRUST_PROXY = "cloudflare";
    resetEnvCacheForTests();
    expect(
      getTrustedClientIp(
        new Headers({
          "cf-connecting-ip": "203.0.113.4",
          "x-forwarded-for": "198.51.100.2",
        }),
      ),
    ).toBe("203.0.113.4");
  });
});
