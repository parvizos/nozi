import { assertRole, AuthorizationError, type ActorContext } from "@nozi/auth";
import {
  SellerStatus,
  SellerUserRole,
  UserRoleCode,
  prisma,
  type Prisma,
} from "@nozi/database";

export const SellerPermission = {
  ManageOrders: "seller:orders:manage",
  ManageProducts: "seller:products:manage",
  ManageStore: "seller:store:manage",
  ViewOrders: "seller:orders:view",
} as const;

export type SellerPermissionCode =
  (typeof SellerPermission)[keyof typeof SellerPermission];

const rolePermissions: Record<SellerUserRole, readonly SellerPermissionCode[]> =
  {
    [SellerUserRole.OWNER]: Object.values(SellerPermission),
    [SellerUserRole.MANAGER]: Object.values(SellerPermission),
    [SellerUserRole.OPERATOR]: [
      SellerPermission.ViewOrders,
      SellerPermission.ManageOrders,
    ],
  };

type DbClient = Prisma.TransactionClient | typeof prisma;

export type SellerMembershipScope = {
  permissions: ReadonlySet<SellerPermissionCode>;
  sellerId: string;
  sellerRole: SellerUserRole;
  storeIds: readonly string[];
};

export async function getSellerMemberships(
  actor: ActorContext,
  db: DbClient = prisma,
): Promise<SellerMembershipScope[]> {
  assertRole(actor, [UserRoleCode.SELLER]);
  const memberships = await db.sellerUser.findMany({
    select: {
      sellerId: true,
      sellerRole: true,
      seller: {
        select: {
          stores: { select: { id: true }, where: { deletedAt: null } },
        },
      },
    },
    where: {
      isActive: true,
      seller: { deletedAt: null, status: SellerStatus.APPROVED },
      userId: actor.userId,
    },
  });
  return memberships.map((membership) => ({
    permissions: new Set(rolePermissions[membership.sellerRole]),
    sellerId: membership.sellerId,
    sellerRole: membership.sellerRole,
    storeIds: membership.seller.stores.map(({ id }) => id),
  }));
}

export async function getAccessibleStoreIds(
  actor: ActorContext,
  db: DbClient = prisma,
): Promise<string[]> {
  return (await getSellerMemberships(actor, db)).flatMap(
    ({ storeIds }) => storeIds,
  );
}

export async function assertSellerStoreAccess(
  actor: ActorContext,
  storeId: string,
  permission: SellerPermissionCode = SellerPermission.ViewOrders,
  db: DbClient = prisma,
): Promise<SellerMembershipScope> {
  const membership = (await getSellerMemberships(actor, db)).find(
    ({ permissions, storeIds }) =>
      storeIds.includes(storeId) && permissions.has(permission),
  );
  if (!membership) {
    throw new AuthorizationError("FORBIDDEN", "Нет доступа к этому магазину");
  }
  return membership;
}

export async function requireSellerWorkspace(
  actor: ActorContext,
): Promise<{ memberships: SellerMembershipScope[]; storeIds: string[] }> {
  const memberships = await getSellerMemberships(actor);
  const storeIds = memberships.flatMap(({ storeIds }) => storeIds);
  if (storeIds.length === 0) {
    throw new AuthorizationError("FORBIDDEN", "Нет доступных магазинов");
  }
  return { memberships, storeIds };
}
