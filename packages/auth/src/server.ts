import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { getEnv } from "@nozi/config";
import { prisma, UserRoleCode, UserStatus } from "@nozi/database";

import { hashPassword, verifyPassword } from "./password";

const env = getEnv();

export const auth = betterAuth({
  account: {
    accountLinking: {
      enabled: false,
    },
  },
  advanced: {
    cookiePrefix: env.SESSION_COOKIE_PREFIX,
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
    database: {
      generateId: "uuid",
    },
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
    },
    useSecureCookies: env.NODE_ENV === "production",
  },
  baseURL: env.APP_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await prisma.user.update({
            data: { lastLoginAt: new Date() },
            where: { id: session.userId },
          });
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          const customerRole = await prisma.role.findUnique({
            select: { id: true },
            where: { code: UserRoleCode.CUSTOMER },
          });

          if (!customerRole) {
            throw new Error("Required CUSTOMER role has not been seeded");
          }

          await prisma.$transaction([
            prisma.userRole.create({
              data: { roleId: customerRole.id, userId: user.id },
            }),
            prisma.customerProfile.create({
              data: { userId: user.id },
            }),
          ]);
        },
      },
    },
  },
  emailAndPassword: {
    autoSignIn: true,
    enabled: true,
    maxPasswordLength: 128,
    minPasswordLength: 12,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
  },
  rateLimit: {
    customRules: {
      "/sign-in/email": { max: 5, window: 60 },
      "/sign-up/email": { max: 3, window: 60 },
    },
    enabled: true,
    max: 100,
    storage: "database",
    window: 60,
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-in/email") {
        return;
      }

      const email =
        context.body &&
        typeof context.body === "object" &&
        "email" in context.body &&
        typeof context.body.email === "string"
          ? context.body.email.toLowerCase()
          : null;

      if (!email) {
        return;
      }

      const user = await prisma.user.findUnique({
        select: { status: true },
        where: { email },
      });

      if (user && user.status !== UserStatus.ACTIVE) {
        throw new APIError("UNAUTHORIZED", {
          message: "Invalid email or password",
        });
      }
    }),
  },
  secret: env.AUTH_SECRET,
  session: {
    cookieCache: {
      enabled: false,
    },
    expiresIn: 60 * 60 * 24 * 7,
    freshAge: 60 * 60 * 24,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [env.APP_URL],
  user: {
    additionalFields: {
      status: {
        defaultValue: UserStatus.ACTIVE,
        input: false,
        required: true,
        type: "string",
      },
    },
    changeEmail: {
      enabled: false,
    },
    deleteUser: {
      enabled: false,
    },
  },
});
