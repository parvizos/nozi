import { hash, verify, type Options } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 65_536,
  outputLen: 32,
  parallelism: 1,
  timeCost: 3,
  version: 1,
} satisfies Options;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  try {
    return await verify(input.hash, input.password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
