import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { getEnv } from "@nozi/config";
import {
  OtpChallengeStatus,
  OtpPurpose,
  OutboxStatus,
  prisma,
  UserStatus,
} from "@nozi/database";

import { IdentityError } from "./identity-error";
import { normalizeTajikPhone } from "./phone";
import { hashClientIp } from "./request-ip";

const OTP_WINDOW_SECONDS = 15 * 60;

function secretKey(): Buffer {
  return createHash("sha256")
    .update(`${getEnv().AUTH_SECRET}:nozi-transient-secrets:v1`)
    .digest();
}

export function encryptTransientSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptTransientSecret(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret envelope");
  const [ivValue, tagValue, encryptedValue] = parts;
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("Invalid encrypted secret envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function codeHash(challengeId: string, phone: string, code: string): string {
  return createHmac("sha256", getEnv().AUTH_SECRET)
    .update(`otp:${challengeId}:${phone}:${code}`)
    .digest("hex");
}

async function consumeBucket(key: string, limit: number): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucketStart = new Date(
    (nowSeconds - (nowSeconds % OTP_WINDOW_SECONDS)) * 1000,
  );
  const keyHash = createHash("sha256").update(`otp:${key}`).digest("hex");
  const bucket = await prisma.rateLimitBucket.upsert({
    create: {
      bucketStart,
      count: 1,
      expiresAt: new Date(bucketStart.getTime() + OTP_WINDOW_SECONDS * 2_000),
      keyHash,
    },
    update: { count: { increment: 1 } },
    where: { keyHash_bucketStart: { bucketStart, keyHash } },
  });
  if (bucket.count > limit)
    throw new IdentityError(
      "OTP_RATE_LIMITED",
      "Слишком много попыток. Попробуйте позже",
      429,
    );
}

export type OtpRequestResult = {
  accepted: true;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  developmentCode?: string;
};

export async function requestPhoneOtp(input: {
  phone: string;
  clientIp: string | null;
  now?: Date;
}): Promise<OtpRequestResult> {
  const env = getEnv();
  const phone = normalizeTajikPhone(input.phone);
  const now = input.now ?? new Date();
  const ipHash = hashClientIp(input.clientIp);
  await consumeBucket(`phone:${phone}`, env.OTP_PHONE_LIMIT_PER_15_MINUTES);
  if (ipHash)
    await consumeBucket(`ip:${ipHash}`, env.OTP_IP_LIMIT_PER_15_MINUTES);
  const current = await prisma.otpChallenge.findFirst({
    orderBy: { createdAt: "desc" },
    where: { phoneE164: phone, status: OtpChallengeStatus.PENDING },
  });
  if (current && current.resendAvailableAt > now)
    throw new IdentityError(
      "OTP_RESEND_COOLDOWN",
      "Новый код можно запросить немного позже",
      429,
    );

  const owner = await prisma.user.findUnique({
    include: { courierProfile: true },
    where: { phoneNumber: phone },
  });
  if (
    owner &&
    (owner.status === UserStatus.SUSPENDED ||
      owner.status === UserStatus.DISABLED ||
      owner.courierProfile?.status === "SUSPENDED")
  ) {
    // Enumeration-safe: inactive identities receive the same accepted response,
    // while no usable challenge or message is created.
    return {
      accepted: true,
      expiresInSeconds: env.OTP_TTL_SECONDS,
      resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }
  const purpose = owner?.courierProfile
    ? OtpPurpose.COURIER_ACTIVATION
    : OtpPurpose.AUTH;
  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1_000);
  const resendAvailableAt = new Date(
    now.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1_000,
  );
  await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.updateMany({
      data: { status: OtpChallengeStatus.SUPERSEDED },
      where: { phoneE164: phone, status: OtpChallengeStatus.PENDING },
    });
    await tx.otpChallenge.create({
      data: {
        attemptCount: 0,
        codeHash: codeHash(id, phone, code),
        encryptedCode: encryptTransientSecret(code),
        expiresAt,
        id,
        maxAttempts: env.OTP_MAX_ATTEMPTS,
        phoneE164: phone,
        purpose,
        requestIpHash: ipHash,
        resendAvailableAt,
      },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateId: id,
        aggregateType: "OtpChallenge",
        dedupeKey: `otp.requested:${id}`,
        maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
        payload: { challengeId: id },
        status: OutboxStatus.PENDING,
        type: "OTP_REQUESTED",
      },
    });
    await tx.auditLog.create({
      data: {
        action: "identity.otp_requested",
        afterRedacted: { purpose },
        ipHash,
        subjectId: createHash("sha256").update(phone).digest("hex"),
        subjectType: "PhoneIdentity",
      },
    });
  });
  return {
    accepted: true,
    ...(env.NODE_ENV !== "production" && env.ENABLE_DEV_OTP_RESPONSE
      ? { developmentCode: code }
      : {}),
    expiresInSeconds: env.OTP_TTL_SECONDS,
    resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export async function verifyAndConsumePhoneOtp(input: {
  phone: string;
  code: string;
  now?: Date;
}): Promise<boolean> {
  let phone: string;
  try {
    phone = normalizeTajikPhone(input.phone);
  } catch {
    return false;
  }
  if (!/^\d{6}$/.test(input.code)) return false;
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.otpChallenge.findFirst({
      orderBy: { createdAt: "desc" },
      where: { phoneE164: phone, status: OtpChallengeStatus.PENDING },
    });
    if (!challenge) {
      codeHash(randomUUID(), phone, input.code);
      return false;
    }
    if (challenge.expiresAt <= now) {
      await tx.otpChallenge.update({
        data: { status: OtpChallengeStatus.EXPIRED },
        where: { id: challenge.id },
      });
      return false;
    }
    if (challenge.attemptCount >= challenge.maxAttempts) {
      await tx.otpChallenge.update({
        data: { status: OtpChallengeStatus.BLOCKED },
        where: { id: challenge.id },
      });
      return false;
    }
    const owner = await tx.user.findUnique({
      include: { courierProfile: true },
      where: { phoneNumber: phone },
    });
    if (
      owner &&
      (owner.status === UserStatus.SUSPENDED ||
        owner.status === UserStatus.DISABLED ||
        owner.courierProfile?.status === "SUSPENDED")
    )
      return false;
    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(
      codeHash(challenge.id, phone, input.code),
      "hex",
    );
    if (!timingSafeEqual(expected, actual)) {
      const attempts = challenge.attemptCount + 1;
      await tx.otpChallenge.update({
        data: {
          attemptCount: attempts,
          ...(attempts >= challenge.maxAttempts
            ? { status: OtpChallengeStatus.BLOCKED }
            : {}),
        },
        where: { id: challenge.id },
      });
      return false;
    }
    const consumed = await tx.otpChallenge.updateMany({
      data: {
        attemptCount: { increment: 1 },
        consumedAt: now,
        status: OtpChallengeStatus.CONSUMED,
      },
      where: { id: challenge.id, status: OtpChallengeStatus.PENDING },
    });
    return consumed.count === 1;
  });
}

export async function onPhoneVerified(input: {
  phone: string;
  userId: string;
}): Promise<void> {
  const phone = normalizeTajikPhone(input.phone);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      include: { courierProfile: true },
      where: { id: input.userId },
    });
    if (!user || user.phoneNumber !== phone) return;
    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.DISABLED ||
      user.courierProfile?.status === "SUSPENDED"
    )
      throw new IdentityError("ACCOUNT_INACTIVE", "Аккаунт недоступен", 403);
    await tx.user.update({
      data: {
        phoneNumberVerified: true,
        phoneVerifiedAt: new Date(),
        ...(user.status === UserStatus.INVITED
          ? { status: UserStatus.ACTIVE }
          : {}),
      },
      where: { id: user.id },
    });
    if (user.courierProfile && user.status === UserStatus.INVITED)
      await tx.courier.update({
        data: { status: "AVAILABLE" },
        where: { id: user.courierProfile.id },
      });
    await tx.auditLog.create({
      data: {
        action: user.courierProfile
          ? "courier.phone_activated"
          : "identity.phone_verified",
        actorUserId: user.id,
        afterRedacted: { phoneVerified: true, status: "ACTIVE" },
        subjectId: user.id,
        subjectType: "User",
      },
    });
  });
}
