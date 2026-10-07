import { assertRole, type ActorContext } from "@nozi/auth";
import {
  ProductStatus,
  StoreStatus,
  UserRoleCode,
  prisma,
} from "@nozi/database";

export class ProductUnavailableError extends Error {
  constructor() {
    super("Product is not available");
    this.name = "ProductUnavailableError";
  }
}

function assertCustomer(actor: ActorContext): void {
  assertRole(actor, [UserRoleCode.CUSTOMER]);
}

export async function addFavorite(
  actor: ActorContext,
  productId: string,
): Promise<void> {
  assertCustomer(actor);
  const product = await prisma.product.findFirst({
    select: { id: true },
    where: {
      deletedAt: null,
      id: productId,
      status: ProductStatus.ACTIVE,
      store: { deletedAt: null, isActive: true, status: StoreStatus.ACTIVE },
    },
  });
  if (!product) throw new ProductUnavailableError();
  await prisma.favorite.upsert({
    create: { customerUserId: actor.userId, productId },
    update: {},
    where: {
      customerUserId_productId: { customerUserId: actor.userId, productId },
    },
  });
}

export async function removeFavorite(
  actor: ActorContext,
  productId: string,
): Promise<void> {
  assertCustomer(actor);
  await prisma.favorite.deleteMany({
    where: { customerUserId: actor.userId, productId },
  });
}

export async function isFavorite(
  userId: string,
  productId: string,
): Promise<boolean> {
  return (
    (await prisma.favorite.count({
      where: { customerUserId: userId, productId },
    })) > 0
  );
}
