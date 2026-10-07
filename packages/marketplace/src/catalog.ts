import {
  ProductStatus,
  SellerStatus,
  StoreStatus,
  prisma,
} from "@nozi/database";
import type { Prisma } from "@nozi/database";

import { catalogQuerySchema, type CatalogQuery } from "./contracts";

export type Money = { amount: string; currency: string };

export type ProductCard = {
  category: { name: string; slug: string };
  compareAtPrice: Money | null;
  id: string;
  image: { alt: string; src: string } | null;
  isFeatured: boolean;
  name: string;
  price: Money;
  rating: string;
  ratingCount: number;
  slug: string;
  stockQuantity: number;
  store: { name: string; slug: string };
};

export type CatalogPage = {
  items: ProductCard[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

const publicStoreWhere = {
  deletedAt: null,
  isActive: true,
  seller: { deletedAt: null, status: SellerStatus.APPROVED },
  status: StoreStatus.ACTIVE,
} satisfies Prisma.StoreWhereInput;

const productCardSelect = {
  category: { select: { name: true, slug: true } },
  compareAtPrice: true,
  id: true,
  images: {
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
    select: { altText: true, objectKey: true },
    take: 1,
    where: { deletedAt: null },
  },
  isFeatured: true,
  name: true,
  price: true,
  ratingAverage: true,
  ratingCount: true,
  slug: true,
  stockQuantity: true,
  store: { select: { name: true, slug: true } },
  currencyCode: true,
} satisfies Prisma.ProductSelect;

type ProductCardRow = Prisma.ProductGetPayload<{
  select: typeof productCardSelect;
}>;

function money(amount: Prisma.Decimal, currency: string): Money {
  return { amount: amount.toFixed(2), currency };
}

function toProductCard(row: ProductCardRow): ProductCard {
  const image = row.images[0];
  return {
    category: row.category,
    compareAtPrice: row.compareAtPrice
      ? money(row.compareAtPrice, row.currencyCode)
      : null,
    id: row.id,
    image: image ? { alt: image.altText, src: image.objectKey } : null,
    isFeatured: row.isFeatured,
    name: row.name,
    price: money(row.price, row.currencyCode),
    rating: row.ratingAverage.toFixed(2),
    ratingCount: row.ratingCount,
    slug: row.slug,
    stockQuantity: row.stockQuantity,
    store: row.store,
  };
}

function orderByFor(
  sort: CatalogQuery["sort"],
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "price-asc":
      return [{ price: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { id: "asc" }];
    case "rating":
      return [
        { ratingAverage: "desc" },
        { ratingCount: "desc" },
        { id: "asc" },
      ];
    case "recommended":
      return [
        { isFeatured: "desc" },
        { ratingAverage: "desc" },
        { ratingCount: "desc" },
        { id: "asc" },
      ];
  }
}

export async function listProducts(
  rawInput: Partial<CatalogQuery> = {},
): Promise<CatalogPage> {
  const input = catalogQuerySchema.parse(rawInput);
  const categoryIds: string[] = [];

  if (input.category) {
    const category = await prisma.category.findFirst({
      select: {
        children: { select: { id: true }, where: { isActive: true } },
        id: true,
      },
      where: { deletedAt: null, isActive: true, slug: input.category },
    });
    if (!category)
      return {
        items: [],
        page: input.page,
        pageCount: 0,
        pageSize: input.pageSize,
        total: 0,
      };
    categoryIds.push(category.id, ...category.children.map(({ id }) => id));
  }

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: ProductStatus.ACTIVE,
    store: {
      ...publicStoreWhere,
      ...(input.store ? { slug: input.store } : {}),
    },
    ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
    ...(input.minPrice || input.maxPrice
      ? {
          price: {
            ...(input.minPrice ? { gte: input.minPrice } : {}),
            ...(input.maxPrice ? { lte: input.maxPrice } : {}),
          },
        }
      : {}),
    ...(input.query
      ? {
          OR: [
            { name: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } },
            { store: { name: { contains: input.query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      orderBy: orderByFor(input.sort),
      select: productCardSelect,
      skip,
      take: input.pageSize,
      where,
    }),
  ]);

  return {
    items: rows.map(toProductCard),
    page: input.page,
    pageCount: Math.ceil(total / input.pageSize),
    pageSize: input.pageSize,
    total,
  };
}

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      description: true,
      imageObjectKey: true,
      name: true,
      slug: true,
      _count: {
        select: {
          products: {
            where: {
              deletedAt: null,
              status: ProductStatus.ACTIVE,
              store: publicStoreWhere,
            },
          },
        },
      },
    },
    where: { deletedAt: null, isActive: true },
  });
}

export async function listPopularStores(limit = 5) {
  const stores = await prisma.store.findMany({
    orderBy: [{ ratingAverage: "desc" }, { ratingCount: "desc" }],
    select: {
      coverImageObjectKey: true,
      defaultPreparationMinutes: true,
      description: true,
      isOpen: true,
      logoObjectKey: true,
      name: true,
      ratingAverage: true,
      ratingCount: true,
      slug: true,
      _count: {
        select: {
          products: {
            where: { deletedAt: null, status: ProductStatus.ACTIVE },
          },
        },
      },
    },
    take: Math.min(limit, 20),
    where: publicStoreWhere,
  });
  return stores.map((store) => ({
    ...store,
    ratingAverage: store.ratingAverage.toFixed(2),
  }));
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findFirst({
    select: { description: true, imageObjectKey: true, name: true, slug: true },
    where: { deletedAt: null, isActive: true, slug },
  });
}

export async function getStoreBySlug(slug: string) {
  const store = await prisma.store.findFirst({
    select: {
      address: { select: { latitude: true, line1: true, longitude: true } },
      city: { select: { name: true, slug: true } },
      coverImageObjectKey: true,
      defaultPreparationMinutes: true,
      description: true,
      isOpen: true,
      isTemporarilyPaused: true,
      logoObjectKey: true,
      minimumOrderAmount: true,
      name: true,
      phoneE164: true,
      ratingAverage: true,
      ratingCount: true,
      slug: true,
    },
    where: { ...publicStoreWhere, slug },
  });
  if (!store) return null;
  return {
    ...store,
    address: store.address
      ? {
          ...store.address,
          latitude: store.address.latitude?.toFixed(6) ?? null,
          longitude: store.address.longitude?.toFixed(6) ?? null,
        }
      : null,
    minimumOrderAmount: store.minimumOrderAmount.toFixed(2),
    ratingAverage: store.ratingAverage.toFixed(2),
  };
}

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    select: {
      category: { select: { name: true, slug: true } },
      compareAtPrice: true,
      currencyCode: true,
      description: true,
      id: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: { altText: true, id: true, isPrimary: true, objectKey: true },
        where: { deletedAt: null },
      },
      name: true,
      preparationTimeMinutes: true,
      price: true,
      ratingAverage: true,
      ratingCount: true,
      slug: true,
      stockQuantity: true,
      store: {
        select: {
          defaultPreparationMinutes: true,
          isOpen: true,
          logoObjectKey: true,
          name: true,
          ratingAverage: true,
          slug: true,
        },
      },
      variants: {
        orderBy: { sortOrder: "asc" },
        select: {
          absolutePrice: true,
          id: true,
          name: true,
          priceDelta: true,
          stockQuantity: true,
        },
        where: { deletedAt: null, isActive: true },
      },
    },
    where: {
      deletedAt: null,
      slug,
      status: ProductStatus.ACTIVE,
      store: publicStoreWhere,
    },
  });
  if (!product) return null;
  return {
    ...product,
    compareAtPrice: product.compareAtPrice?.toFixed(2) ?? null,
    price: product.price.toFixed(2),
    ratingAverage: product.ratingAverage.toFixed(2),
    store: {
      ...product.store,
      ratingAverage: product.store.ratingAverage.toFixed(2),
    },
    variants: product.variants.map((variant) => ({
      ...variant,
      absolutePrice: variant.absolutePrice?.toFixed(2) ?? null,
      priceDelta: variant.priceDelta.toFixed(2),
    })),
  };
}

export async function getHomePageData() {
  const [categories, stores, featured, fresh] = await Promise.all([
    listCategories(),
    listPopularStores(5),
    listProducts({ pageSize: 8, sort: "recommended" }),
    listProducts({ pageSize: 4, sort: "newest" }),
  ]);
  return { categories, featured: featured.items, fresh: fresh.items, stores };
}
