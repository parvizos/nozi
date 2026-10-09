import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const serverEnvSchema = z
  .object({
    ALLOW_DEMO_SEED: booleanFromString.default(false),
    APP_URL: z.url(),
    AUTH_SECRET: z
      .string()
      .min(32, "AUTH_SECRET must contain at least 32 characters"),
    DATABASE_URL: z.string().min(1).startsWith("postgresql://"),
    DEMO_USER_PASSWORD: z.string().min(12).optional(),
    COURIER_INVITATION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24),
    DELIVERY_CODE_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    DELIVERY_CODE_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(15)
      .max(1440)
      .default(240),
    ENABLE_DELIVERY_CODES: booleanFromString.default(false),
    ENABLE_DEV_OTP_RESPONSE: booleanFromString.default(false),
    ENABLE_TEST_PAYMENTS: booleanFromString.default(false),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    MAX_DELIVERY_HORIZON_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(30),
    MAX_PENDING_CASH_ORDERS_PER_CUSTOMER: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(3),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce
      .number()
      .int()
      .min(15)
      .max(600)
      .default(60),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    OTP_PHONE_LIMIT_PER_15_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    OTP_IP_LIMIT_PER_15_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
    SMS_PROVIDER: z
      .enum(["disabled", "console", "mock", "http"])
      .default("console"),
    SMS_REQUIRED: booleanFromString.default(false),
    SMS_FROM: z.string().min(1).max(30).optional(),
    SMS_API_KEY: z.string().min(1).optional(),
    SMS_API_URL: z.url().optional(),
    TRUST_PROXY: z.enum(["false", "cloudflare"]).default("false"),
    TURNSTILE_MODE: z
      .enum(["disabled", "optional", "required"])
      .default("disabled"),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
    OUTBOX_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(2_000),
    OUTBOX_BASE_BACKOFF_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(600)
      .default(10),
    WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    STALE_ORDER_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(10)
      .max(3600)
      .default(60),
    CLEANUP_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(60),
    OTP_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    RATE_LIMIT_RETENTION_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(720)
      .default(24),
    IDEMPOTENCY_RETENTION_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(2160)
      .default(168),
    ABANDONED_CART_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COURIER_LOCATION_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    SESSION_COOKIE_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/i)
      .default("nozi"),
    SELLER_CONFIRMATION_SLA_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(120)
      .default(15),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.ALLOW_DEMO_SEED) {
      context.addIssue({
        code: "custom",
        message: "ALLOW_DEMO_SEED must be false in production",
        path: ["ALLOW_DEMO_SEED"],
      });
    }

    if (env.NODE_ENV === "production" && env.ENABLE_TEST_PAYMENTS) {
      context.addIssue({
        code: "custom",
        message: "ENABLE_TEST_PAYMENTS must be false in production",
        path: ["ENABLE_TEST_PAYMENTS"],
      });
    }

    if (env.NODE_ENV === "production" && env.ENABLE_DEV_OTP_RESPONSE) {
      context.addIssue({
        code: "custom",
        message: "ENABLE_DEV_OTP_RESPONSE must be false in production",
        path: ["ENABLE_DEV_OTP_RESPONSE"],
      });
    }

    if (
      env.NODE_ENV === "production" &&
      env.SMS_REQUIRED &&
      env.SMS_PROVIDER !== "http"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "SMS_PROVIDER=http is required when SMS_REQUIRED=true in production",
        path: ["SMS_PROVIDER"],
      });
    }

    if (env.SMS_PROVIDER === "http") {
      if (!env.SMS_API_URL || !env.SMS_API_KEY || !env.SMS_FROM) {
        context.addIssue({
          code: "custom",
          message:
            "SMS_API_URL, SMS_API_KEY and SMS_FROM are required for the http SMS provider",
          path: ["SMS_PROVIDER"],
        });
      } else if (
        env.NODE_ENV === "production" &&
        !env.SMS_API_URL.startsWith("https://")
      ) {
        context.addIssue({
          code: "custom",
          message: "SMS_API_URL must use HTTPS in production",
          path: ["SMS_API_URL"],
        });
      }
    }

    if (
      env.NODE_ENV === "production" &&
      env.TURNSTILE_MODE === "required" &&
      !env.TURNSTILE_SECRET_KEY
    ) {
      context.addIssue({
        code: "custom",
        message: "TURNSTILE_SECRET_KEY is required when Turnstile is required",
        path: ["TURNSTILE_SECRET_KEY"],
      });
    }

    if (env.ALLOW_DEMO_SEED && !env.DEMO_USER_PASSWORD) {
      context.addIssue({
        code: "custom",
        message: "DEMO_USER_PASSWORD is required when demo seed is enabled",
        path: ["DEMO_USER_PASSWORD"],
      });
    }

    if (env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        message: "APP_URL must use HTTPS in production",
        path: ["APP_URL"],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function parseServerEnv(input: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");

    throw new Error(`Invalid server environment: ${details}`);
  }

  return result.data;
}

export function getEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

export function resetEnvCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Environment cache can only be reset during tests");
  }

  cachedEnv = undefined;
}
