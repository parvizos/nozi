import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "@nozi/config";

import { PrismaClient } from "../generated/client/client";

const globalForPrisma = globalThis as unknown as {
  noziPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const env = getEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "error" },
            { emit: "event", level: "warn" },
          ]
        : [{ emit: "event", level: "error" }],
  });
}

export const prisma = globalForPrisma.noziPrisma ?? createPrismaClient();

if (getEnv().NODE_ENV !== "production") {
  globalForPrisma.noziPrisma = prisma;
}
