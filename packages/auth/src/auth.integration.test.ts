import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma, UserRoleCode, UserStatus } from "@nozi/database";

import { buildActorContext, Permission } from "./rbac";
import { auth } from "./server";
import { setUserStatus } from "./user-status";

const createdEmails: string[] = [];
const auditSubjectIds: string[] = [];

function authRequest(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set("origin", "http://localhost:3000");

  if (init?.body) {
    headers.set("content-type", "application/json");
  }

  return new Request(`http://localhost:3000/api/auth${path}`, {
    ...init,
    headers,
  });
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

beforeAll(async () => {
  await Promise.all(
    [UserRoleCode.CUSTOMER, UserRoleCode.ADMIN].map((code) =>
      prisma.role.upsert({
        create: { code, description: `${code} test role` },
        update: {},
        where: { code },
      }),
    ),
  );
});

afterEach(async () => {
  if (auditSubjectIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { subjectId: { in: auditSubjectIds.splice(0) } },
    });
  }

  if (createdEmails.length === 0) {
    return;
  }

  await prisma.user.deleteMany({
    where: { email: { in: createdEmails.splice(0) } },
  });
});

describe("database-backed authentication", () => {
  it("creates an Argon2id credential and a revocable database session", async () => {
    const email = `auth-${randomUUID()}@nozi.test`;
    createdEmails.push(email);

    const signUpResponse = await auth.handler(
      authRequest("/sign-up/email", {
        body: JSON.stringify({
          email,
          name: "Authentication Test",
          password: "A-secure-integration-password-123!",
        }),
        method: "POST",
      }),
    );

    expect(signUpResponse.status).toBe(200);
    const cookie = cookiesFrom(signUpResponse);
    expect(cookie).toContain("session_token");

    const user = await prisma.user.findUniqueOrThrow({
      include: {
        accounts: true,
        roles: { include: { role: true } },
        sessions: true,
      },
      where: { email },
    });
    expect(user.accounts[0]?.password).toMatch(/^\$argon2id\$/);
    expect(user.accounts[0]?.password).not.toContain(
      "A-secure-integration-password-123!",
    );
    expect(user.sessions).toHaveLength(1);
    expect(user.roles.map(({ role }) => role.code)).toContain(
      UserRoleCode.CUSTOMER,
    );

    const sessionResponse = await auth.handler(
      authRequest("/get-session", { headers: { cookie }, method: "GET" }),
    );
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      user: { email },
    });

    const signOutResponse = await auth.handler(
      authRequest("/sign-out", { headers: { cookie }, method: "POST" }),
    );
    expect(signOutResponse.status).toBe(200);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("does not issue a new session for a suspended account", async () => {
    const email = `suspended-${randomUUID()}@nozi.test`;
    const password = "A-secure-integration-password-456!";
    createdEmails.push(email);

    const signUpResponse = await auth.handler(
      authRequest("/sign-up/email", {
        body: JSON.stringify({ email, name: "Suspended Test", password }),
        method: "POST",
      }),
    );
    expect(signUpResponse.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        data: { status: UserStatus.SUSPENDED },
        where: { id: user.id },
      }),
    ]);

    const signInResponse = await auth.handler(
      authRequest("/sign-in/email", {
        body: JSON.stringify({ email, password }),
        method: "POST",
      }),
    );

    expect(signInResponse.status).toBe(401);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("revokes sessions and writes an audit record when an admin suspends a user", async () => {
    const adminEmail = `admin-${randomUUID()}@nozi.test`;
    const customerEmail = `customer-${randomUUID()}@nozi.test`;
    createdEmails.push(adminEmail, customerEmail);

    const [admin, customer, adminRole] = await Promise.all([
      prisma.user.create({ data: { email: adminEmail, name: "Test Admin" } }),
      prisma.user.create({
        data: { email: customerEmail, name: "Test Customer" },
      }),
      prisma.role.findUniqueOrThrow({ where: { code: UserRoleCode.ADMIN } }),
    ]);
    auditSubjectIds.push(customer.id);

    await prisma.$transaction([
      prisma.userRole.create({
        data: { roleId: adminRole.id, userId: admin.id },
      }),
      prisma.session.create({
        data: {
          expiresAt: new Date(Date.now() + 60_000),
          token: randomUUID(),
          userId: customer.id,
        },
      }),
    ]);

    const actor = buildActorContext({
      explicitPermissions: [Permission.AdminManage],
      roles: [UserRoleCode.ADMIN],
      status: UserStatus.ACTIVE,
      userId: admin.id,
    });

    await setUserStatus(actor, {
      reason: "Repeated marketplace policy violation",
      status: UserStatus.SUSPENDED,
      targetUserId: customer.id,
    });

    await expect(
      prisma.session.count({ where: { userId: customer.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.user.findUniqueOrThrow({
        select: { status: true },
        where: { id: customer.id },
      }),
    ).resolves.toEqual({ status: UserStatus.SUSPENDED });
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { subjectId: customer.id },
      }),
    ).resolves.toMatchObject({
      action: "user.status.changed",
      actorUserId: admin.id,
      reason: "Repeated marketplace policy violation",
    });
  });
});
