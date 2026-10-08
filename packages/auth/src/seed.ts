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
  "admin.manage": "Manage administrative access",
  "audit.read": "Read audit trail",
  "categories.manage": "Manage catalog categories",
  "couriers.manage": "Manage couriers and assignments",
  "customers.manage": "Suspend and reactivate customers",
  "customers.read": "Read customer support profiles",
  "finance.read": "Read finance and ledger data",
  "orders.manage": "Manage marketplace orders",
  "orders.read": "Read marketplace orders",
  "products.moderate": "Moderate marketplace products",
  "sellers.manage": "Manage seller lifecycle",
  "sellers.read": "Read seller profiles",
  "stores.manage": "Manage store moderation fields",
  "stores.read": "Read store operations",
} as const;

const demoUsers: Array<{
  email: string;
  name: string;
  permissions?: string[];
  roles: UserRoleCode[];
}> = [
  {
    email: "admin@nozi.local",
    name: "NOZI Operations Admin",
    permissions: [
      "orders.read",
      "orders.manage",
      "sellers.read",
      "sellers.manage",
      "stores.read",
      "stores.manage",
      "customers.read",
      "customers.manage",
      "couriers.manage",
      "audit.read",
    ],
    roles: [UserRoleCode.ADMIN],
  },
  {
    email: "admin.support@nozi.local",
    name: "NOZI Support Admin",
    permissions: [
      "orders.read",
      "orders.manage",
      "sellers.read",
      "customers.read",
      "customers.manage",
      "audit.read",
    ],
    roles: [UserRoleCode.ADMIN],
  },
  {
    email: "admin.catalog@nozi.local",
    name: "NOZI Catalog Admin",
    permissions: [
      "sellers.read",
      "stores.read",
      "products.moderate",
      "categories.manage",
      "audit.read",
    ],
    roles: [UserRoleCode.ADMIN],
  },
  {
    email: "admin.finance@nozi.local",
    name: "NOZI Finance Admin",
    permissions: ["finance.read", "audit.read"],
    roles: [UserRoleCode.ADMIN],
  },
  {
    email: "superadmin@nozi.local",
    name: "NOZI Super Admin",
    roles: [UserRoleCode.SUPER_ADMIN],
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
    email: "courier.two@nozi.local",
    name: "Demo Courier Two",
    roles: [UserRoleCode.COURIER],
  },
  {
    email: "courier.three@nozi.local",
    name: "Demo Courier Three",
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
      prisma.userAdminPermission.deleteMany({ where: { userId: user.id } }),
      ...roles.map((role) =>
        prisma.userRole.create({ data: { roleId: role.id, userId: user.id } }),
      ),
      ...(
        await prisma.adminPermission.findMany({
          select: { id: true },
          where: { code: { in: demoUser.permissions ?? [] } },
        })
      ).map((permission) =>
        prisma.userAdminPermission.create({
          data: { permissionId: permission.id, userId: user.id },
        }),
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
            "admin@nozi.local",
            "courier@nozi.local",
            "courier.two@nozi.local",
            "courier.three@nozi.local",
          ],
        },
      },
    });
    const userId = (email: string) =>
      seededUsers.find((user) => user.email === email)?.id;
    await seedMarketplace({
      adminId: userId("admin@nozi.local"),
      atlasOwnerId: userId("seller.atlas@nozi.local"),
      customerId: userId("customer@nozi.local"),
      courierUserIds: [
        userId("courier@nozi.local"),
        userId("courier.two@nozi.local"),
        userId("courier.three@nozi.local"),
      ].filter((id): id is string => Boolean(id)),
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
