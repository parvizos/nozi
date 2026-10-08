import { getEnv } from "@nozi/config";
import { prisma, seedMarketplace, UserRoleCode } from "@nozi/database";

import { hashPassword } from "./password";
import { auth } from "./server";

const roleDescriptions: Record<UserRoleCode, string> = {
  [UserRoleCode.CUSTOMER]: "Marketplace customer",
  [UserRoleCode.SELLER]: "Seller organization member",
  [UserRoleCode.COURIER]: "Delivery courier",
  [UserRoleCode.ADMIN]: "Marketplace operations administrator",
  [UserRoleCode.SUPER_ADMIN]: "Restricted platform administrator",
};

const permissionDescriptions = {
  "admin:access": "Access the admin workspace",
  "admin:permissions:manage": "Manage explicit admin permissions",
  "admin:users:manage": "Manage marketplace user status",
} as const;

const demoUsers: Array<{ email: string; name: string; roles: UserRoleCode[] }> =
  [
    {
      email: "admin@nozi.local",
      name: "NOZI Admin",
      roles: [UserRoleCode.ADMIN],
    },
    {
      email: "seller@nozi.local",
      name: "Demo Seller",
      roles: [UserRoleCode.SELLER],
    },
    {
      email: "seller.manager@nozi.local",
      name: "Safina Manager",
      roles: [UserRoleCode.SELLER],
    },
    {
      email: "seller.operator@nozi.local",
      name: "Safina Operator",
      roles: [UserRoleCode.SELLER],
    },
    {
      email: "seller.atlas@nozi.local",
      name: "Atlas Owner",
      roles: [UserRoleCode.SELLER],
    },
    {
      email: "courier@nozi.local",
      name: "Demo Courier",
      roles: [UserRoleCode.COURIER],
    },
    {
      email: "customer@nozi.local",
      name: "Demo Customer",
      roles: [UserRoleCode.CUSTOMER],
    },
  ];

async function seedRolesAndPermissions(): Promise<void> {
  for (const roleCode of Object.values(UserRoleCode)) {
    await prisma.role.upsert({
      create: { code: roleCode, description: roleDescriptions[roleCode] },
      update: { description: roleDescriptions[roleCode] },
      where: { code: roleCode },
    });
  }

  for (const [code, description] of Object.entries(permissionDescriptions)) {
    await prisma.adminPermission.upsert({
      create: { code, description },
      update: { description },
      where: { code },
    });
  }
}

async function seedDemoUsers(password: string): Promise<void> {
  for (const demoUser of demoUsers) {
    let user = await prisma.user.findUnique({
      where: { email: demoUser.email },
    });

    if (!user) {
      await auth.api.signUpEmail({
        body: {
          email: demoUser.email,
          name: demoUser.name,
          password,
        },
      });
      user = await prisma.user.findUniqueOrThrow({
        where: { email: demoUser.email },
      });
    }

    const passwordHash = await hashPassword(password);
    await prisma.account.updateMany({
      data: { password: passwordHash },
      where: { providerId: "credential", userId: user.id },
    });

    const roles = await prisma.role.findMany({
      select: { id: true },
      where: { code: { in: demoUser.roles } },
    });

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: user.id } }),
      ...roles.map((role) =>
        prisma.userRole.create({ data: { roleId: role.id, userId: user.id } }),
      ),
    ]);
  }
}

async function main(): Promise<void> {
  const env = getEnv();

  await seedRolesAndPermissions();

  if (env.ALLOW_DEMO_SEED) {
    if (env.NODE_ENV === "production" || !env.DEMO_USER_PASSWORD) {
      throw new Error(
        "Demo accounts cannot be seeded with the current environment",
      );
    }

    await seedDemoUsers(env.DEMO_USER_PASSWORD);
    const seededUsers = await prisma.user.findMany({
      select: { email: true, id: true },
      where: {
        email: {
          in: [
            "seller@nozi.local",
            "seller.manager@nozi.local",
            "seller.operator@nozi.local",
            "seller.atlas@nozi.local",
            "customer@nozi.local",
          ],
        },
      },
    });
    const userId = (email: string) =>
      seededUsers.find((user) => user.email === email)?.id;
    await seedMarketplace({
      atlasOwnerId: userId("seller.atlas@nozi.local"),
      customerId: userId("customer@nozi.local"),
      managerId: userId("seller.manager@nozi.local"),
      operatorId: userId("seller.operator@nozi.local"),
      ownerId: userId("seller@nozi.local"),
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Database seed failed",
    );
    await prisma.$disconnect();
    process.exitCode = 1;
  });
