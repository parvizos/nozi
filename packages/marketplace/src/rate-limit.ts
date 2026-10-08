import { createHash } from "node:crypto";

import { prisma } from "@nozi/database";

import { MarketplaceError } from "./errors";

export async function consumeCheckoutRateLimit(
  userId: string,
  limit = 5,
  windowSeconds = 60,
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucketSeconds = nowSeconds - (nowSeconds % windowSeconds);
  const bucketStart = new Date(bucketSeconds * 1000);
  const expiresAt = new Date((bucketSeconds + windowSeconds * 2) * 1000);
  const keyHash = createHash("sha256")
    .update(`checkout:${userId}`)
    .digest("hex");
  const bucket = await prisma.rateLimitBucket.upsert({
    create: { bucketStart, count: 1, expiresAt, keyHash },
    update: { count: { increment: 1 }, expiresAt },
    where: { keyHash_bucketStart: { bucketStart, keyHash } },
  });
  if (bucket.count > limit) {
    throw new MarketplaceError(
      "CHECKOUT_RATE_LIMITED",
      "Слишком много попыток оформления. Попробуйте через минуту",
      429,
    );
  }
}

export async function consumeAdminMutationRateLimit(
  userId: string,
  action: string,
  limit = 30,
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucketStart = new Date((nowSeconds - (nowSeconds % 60)) * 1000);
  const keyHash = createHash("sha256")
    .update(`admin:${action}:${userId}`)
    .digest("hex");
  const bucket = await prisma.rateLimitBucket.upsert({
    create: {
      bucketStart,
      count: 1,
      expiresAt: new Date(bucketStart.getTime() + 120_000),
      keyHash,
    },
    update: { count: { increment: 1 } },
    where: { keyHash_bucketStart: { bucketStart, keyHash } },
  });
  if (bucket.count > limit) {
    throw new MarketplaceError(
      "CHECKOUT_RATE_LIMITED",
      "Слишком много административных операций",
      429,
    );
  }
}
