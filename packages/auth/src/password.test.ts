import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("Argon2id password handling", () => {
  it("stores a salted Argon2id hash and verifies the original password", async () => {
    const password = "correct horse battery staple";
    const firstHash = await hashPassword(password);
    const secondHash = await hashPassword(password);

    expect(firstHash).toMatch(/^\$argon2id\$/);
    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword({ hash: firstHash, password })).resolves.toBe(
      true,
    );
  });

  it("rejects an invalid password and malformed hash without throwing", async () => {
    const passwordHash = await hashPassword("a sufficiently long password");

    await expect(
      verifyPassword({ hash: passwordHash, password: "different password" }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword({ hash: "not-a-hash", password: "password" }),
    ).resolves.toBe(false);
  });
});
