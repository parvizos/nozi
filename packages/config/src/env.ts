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
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    SESSION_COOKIE_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/i)
      .default("nozi"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.ALLOW_DEMO_SEED) {
      context.addIssue({
        code: "custom",
        message: "ALLOW_DEMO_SEED must be false in production",
        path: ["ALLOW_DEMO_SEED"],
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
