import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildActorContext } from "@nozi/auth";
import {
  ProductStatus,
  SellerUserRole,
  UserRoleCode,
  UserStatus,
  prisma,
  seedMarketplace,
} from "@nozi/database";

import {
  getCategoryBySlug,
  getProductBySlug,
  getStoreBySlug,
  listProducts,
} from "./catalog";
import { addFavorite, isFavorite, removeFavorite } from "./favorites";
import {
  assertSellerStoreAccess,
  getAccessibleStoreIds,
} from "./seller-access";

const createdUserIds: string[] = [];

beforeAll(async () => {
  await seedMarketplace();
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

describe.sequential("marketplace catalog queries", () => {
  it("paginates deterministically without loading the full catalog", async () => {
    const first = await listProducts({ page: 1, pageSize: 7 });
    const second = await listProducts({ page: 2, pageSize: 7 });

    expect(first.total).toBe(48);
    expect(first.items).toHaveLength(7);
    expect(second.items).toHaveLength(7);
    expect(
      new Set([...first.items, ...second.items].map(({ id }) => id)).size,
    ).toBe(14);
  });

  it("applies category and price filters in PostgreSQL", async () => {
    const result = await listProducts({
      category: "flowers",
      maxPrice: "220",
      minPrice: "100",
      pageSize: 48,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.every(({ category }) => category.slug === "flowers"),
    ).toBe(true);
    expect(
      result.items.every(
        ({ price }) =>
          Number(price.amount) >= 100 && Number(price.amount) <= 220,
      ),
    ).toBe(true);
  });

  it("searches product text and store names", async () => {
    const byProduct = await listProducts({ pageSize: 12, query: "Клубника" });
    const byStore = await listProducts({ pageSize: 48, query: "Safina" });

    expect(
      byProduct.items.some(({ name }) => name === "Клубника в шоколаде"),
    ).toBe(true);
    expect(byStore.items.length).toBeGreaterThan(0);
    expect(
      byStore.items.every(({ store }) => store.name === "Safina Flowers"),
    ).toBe(true);
  });

  it("resolves SEO slugs and excludes hidden products", async () => {
    const [category, store, product] = await Promise.all([
      getCategoryBySlug("bouquets"),
      getStoreBySlug("safina-flowers"),
      getProductBySlug("bouquets-1-nozi"),
    ]);

    expect(category?.name).toBe("Bouquets");
    expect(store?.name).toBe("Safina Flowers");
    expect(product?.name).toBe("Розовый рассвет");
    if (!product) throw new Error("Seed product missing");

    await prisma.product.update({
      data: { status: ProductStatus.HIDDEN },
      where: { id: product.id },
    });
    try {
      await expect(getProductBySlug(product.slug)).resolves.toBeNull();
    } finally {
      await prisma.product.update({
        data: { status: ProductStatus.ACTIVE },
        where: { id: product.id },
      });
    }
  });
});

describe.sequential("marketplace authorization", () => {
  it("allows only authenticated customers to mutate their own favorites", async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { status: ProductStatus.ACTIVE },
    });
    const customerId = randomUUID();
    const sellerId = randomUUID();
    createdUserIds.push(customerId, sellerId);
    await prisma.user.createMany({
      data: [
        {
          email: `favorite-${customerId}@nozi.test`,
          id: customerId,
          name: "Favorite Customer",
        },
        {
          email: `favorite-${sellerId}@nozi.test`,
          id: sellerId,
          name: "Seller Without Customer Role",
        },
      ],
    });
    const customer = buildActorContext({
      roles: [UserRoleCode.CUSTOMER],
      status: UserStatus.ACTIVE,
      userId: customerId,
    });
    const seller = buildActorContext({
      roles: [UserRoleCode.SELLER],
      status: UserStatus.ACTIVE,
      userId: sellerId,
    });

    await addFavorite(customer, product.id);
    await expect(isFavorite(customerId, product.id)).resolves.toBe(true);
    await expect(addFavorite(seller, product.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await removeFavorite(customer, product.id);
    await expect(isFavorite(customerId, product.id)).resolves.toBe(false);
  });

  it("scopes seller users to stores owned by their seller entity", async () => {
    const [ownedSeller, otherStore] = await Promise.all([
      prisma.seller.findUniqueOrThrow({
        where: { id: "20000000-0000-4000-8000-000000000001" },
        include: { stores: true },
      }),
      prisma.store.findFirstOrThrow({
        where: { sellerId: "20000000-0000-4000-8000-000000000002" },
      }),
    ]);
    const userId = randomUUID();
    createdUserIds.push(userId);
    await prisma.user.create({
      data: {
        email: `scope-${userId}@nozi.test`,
        id: userId,
        name: "Scoped Seller",
      },
    });
    await prisma.sellerUser.create({
      data: {
        sellerId: ownedSeller.id,
        sellerRole: SellerUserRole.MANAGER,
        userId,
      },
    });
    const actor = buildActorContext({
      roles: [UserRoleCode.SELLER],
      status: UserStatus.ACTIVE,
      userId,
    });

    await expect(getAccessibleStoreIds(actor)).resolves.toEqual(
      ownedSeller.stores.map(({ id }) => id),
    );
    await expect(
      assertSellerStoreAccess(actor, otherStore.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
