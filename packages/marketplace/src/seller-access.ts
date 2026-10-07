import { assertRole, AuthorizationError, type ActorContext } from "@nozi/auth";
import { SellerStatus, UserRoleCode, prisma } from "@nozi/database";

export async function getAccessibleStoreIds(
  actor: ActorContext,
): Promise<string[]> {
  assertRole(actor, [UserRoleCode.SELLER]);
  const memberships = await prisma.sellerUser.findMany({
    select: {
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
  return memberships.flatMap(({ seller }) => seller.stores.map(({ id }) => id));
}

export async function assertSellerStoreAccess(
  actor: ActorContext,
  storeId: string,
): Promise<void> {
  const storeIds = await getAccessibleStoreIds(actor);
  if (!storeIds.includes(storeId)) {
    throw new AuthorizationError("FORBIDDEN", "You cannot access this store");
  }
}
