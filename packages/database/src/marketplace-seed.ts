import {
  ProductStatus,
  SellerStatus,
  SellerUserRole,
  StoreStatus,
} from "../generated/client/client";
import { prisma } from "./client";

const categoryFixtures = [
  {
    description: "Свежие сезонные цветы для любого повода.",
    imageObjectKey: "/images/products/flowers.svg",
    name: "Flowers",
    slug: "flowers",
  },
  {
    description: "Авторские букеты, собранные флористами Душанбе.",
    imageObjectKey: "/images/products/bouquets.svg",
    name: "Bouquets",
    slug: "bouquets",
  },
  {
    description: "Продуманные подарочные боксы с красивой упаковкой.",
    imageObjectKey: "/images/products/gift-boxes.svg",
    name: "Gift Boxes",
    slug: "gift-boxes",
  },
  {
    description: "Торты, шоколад и сладкие подарки от локальных мастеров.",
    imageObjectKey: "/images/products/cakes-sweets.svg",
    name: "Cakes & Sweets",
    slug: "cakes-sweets",
  },
  {
    description: "Воздушные композиции для яркого праздника.",
    imageObjectKey: "/images/products/balloons.svg",
    name: "Balloons",
    slug: "balloons",
  },
  {
    description: "Тёплые подарки и детали, которые запоминаются.",
    imageObjectKey: "/images/products/gifts.svg",
    name: "Gifts",
    slug: "gifts",
  },
] as const;

const sellerFixtures = [
  {
    address: "проспект Рудаки, 86",
    cover: "/images/products/bouquets.svg",
    description:
      "Современная флористика, свежие поставки и бережная сборка каждого букета.",
    id: "20000000-0000-4000-8000-000000000001",
    lat: "38.585913",
    logo: "/images/products/flowers.svg",
    lng: "68.786405",
    name: "Safina Flowers",
    phone: "+992900001101",
    rating: "4.92",
    ratingCount: 184,
    sellerName: "Safina Floral House",
    slug: "safina-flowers",
    taxId: "NOZI-SAFINA-001",
  },
  {
    address: "улица Айни, 48",
    cover: "/images/products/gift-boxes.svg",
    description:
      "Подарочные наборы с таджикским характером, премиальным чаем и сладостями.",
    id: "20000000-0000-4000-8000-000000000002",
    lat: "38.571228",
    logo: "/images/products/gifts.svg",
    lng: "68.799592",
    name: "Atlas Gift Studio",
    phone: "+992900001102",
    rating: "4.88",
    ratingCount: 126,
    sellerName: "Atlas Gifts LLC",
    slug: "atlas-gift-studio",
    taxId: "NOZI-ATLAS-002",
  },
  {
    address: "улица Бухоро, 32",
    cover: "/images/products/cakes-sweets.svg",
    description:
      "Небольшая кондитерская с десертами ручной работы и доставкой день в день.",
    id: "20000000-0000-4000-8000-000000000003",
    lat: "38.575740",
    logo: "/images/products/cakes-sweets.svg",
    lng: "68.778890",
    name: "Cacao & Berry",
    phone: "+992900001103",
    rating: "4.81",
    ratingCount: 98,
    sellerName: "Cacao Berry TJ",
    slug: "cacao-berry",
    taxId: "NOZI-CACAO-003",
  },
  {
    address: "улица Нусратулло Махсум, 74",
    cover: "/images/products/balloons.svg",
    description:
      "Стильные воздушные композиции и оформление камерных праздников.",
    id: "20000000-0000-4000-8000-000000000004",
    lat: "38.589365",
    logo: "/images/products/balloons.svg",
    lng: "68.747531",
    name: "Cloud Nine Balloons",
    phone: "+992900001104",
    rating: "4.76",
    ratingCount: 73,
    sellerName: "Cloud Nine Decor",
    slug: "cloud-nine-balloons",
    taxId: "NOZI-CLOUD-004",
  },
  {
    address: "улица Шотемур, 22",
    cover: "/images/products/gifts.svg",
    description:
      "Подарки для близких: от уютных наборов до памятных деталей ручной работы.",
    id: "20000000-0000-4000-8000-000000000005",
    lat: "38.579427",
    logo: "/images/products/gift-boxes.svg",
    lng: "68.783691",
    name: "Mehr Boutique",
    phone: "+992900001105",
    rating: "4.85",
    ratingCount: 112,
    sellerName: "Mehr Boutique LLC",
    slug: "mehr-boutique",
    taxId: "NOZI-MEHR-005",
  },
] as const;

const productsByCategory = {
  balloons: [
    "Облако нежности",
    "Золотой праздник",
    "Birthday Confetti",
    "Сердца над городом",
    "Мятная вечеринка",
    "Воздушный комплимент",
    "Первый день рождения",
    "Сияющий сюрприз",
  ],
  bouquets: [
    "Розовый рассвет",
    "Белый сад",
    "Тёплая встреча",
    "Парижское утро",
    "Сиреневый воздух",
    "Нежность пионов",
    "Солнечный букет",
    "Вечер в Душанбе",
  ],
  "cakes-sweets": [
    "Фисташковый сад",
    "Медовый мини-торт",
    "Клубника в шоколаде",
    "Macaron Palette",
    "Шоколадный бархат",
    "Ягодный чизкейк",
    "Sweet Thank You",
    "Восточная коллекция",
  ],
  flowers: [
    "Коралловые розы",
    "Белые тюльпаны",
    "Ромашковое поле",
    "Розы Cappuccino",
    "Лилии и эвкалипт",
    "Красные розы Premium",
    "Сезонные пионы",
    "Гортензия Ocean",
  ],
  "gift-boxes": [
    "Утро для неё",
    "Tea Ceremony",
    "Спокойный вечер",
    "Coffee Lover Box",
    "Тёплое спасибо",
    "Праздничный дастархан",
    "Care & Comfort",
    "Tajik Taste Box",
  ],
  gifts: [
    "Свеча Тёплый инжир",
    "Шёлковый платок Atlas",
    "Мишка с открыткой",
    "Керамическая ваза Sand",
    "Аромат для дома Mehr",
    "Фотоальбом Moments",
    "Набор для уютного утра",
    "Мини-сад в стекле",
  ],
} as const;

function productSlug(
  name: string,
  categorySlug: string,
  index: number,
): string {
  return `${categorySlug}-${index + 1}-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "nozi"
  }`;
}

export async function seedMarketplace(sellerUserId?: string): Promise<void> {
  const country = await prisma.country.upsert({
    create: {
      defaultCurrencyCode: "TJS",
      isoCode: "TJ",
      name: "Tajikistan",
    },
    update: { defaultCurrencyCode: "TJS", isActive: true, name: "Tajikistan" },
    where: { isoCode: "TJ" },
  });

  const city = await prisma.city.upsert({
    create: {
      countryId: country.id,
      currencyCode: "TJS",
      locale: "ru-TJ",
      name: "Душанбе",
      slug: "dushanbe",
      timezone: "Asia/Dushanbe",
    },
    update: { currencyCode: "TJS", isActive: true, name: "Душанбе" },
    where: { countryId_slug: { countryId: country.id, slug: "dushanbe" } },
  });

  const categories = new Map<string, string>();
  for (const [index, fixture] of categoryFixtures.entries()) {
    const category = await prisma.category.upsert({
      create: { ...fixture, sortOrder: index },
      update: { ...fixture, isActive: true, sortOrder: index },
      where: { slug: fixture.slug },
    });
    categories.set(fixture.slug, category.id);
  }

  const stores: Array<{ id: string; slug: string }> = [];
  for (const [index, fixture] of sellerFixtures.entries()) {
    const seller = await prisma.seller.upsert({
      create: {
        approvedAt: new Date("2026-09-01T08:00:00.000Z"),
        defaultCommissionRate: "15.00",
        documentsStatus: "VERIFIED",
        id: fixture.id,
        legalName: fixture.sellerName,
        publicName: fixture.name,
        status: SellerStatus.APPROVED,
        supportEmail: `hello-${fixture.slug}@nozi.local`,
        supportPhoneE164: fixture.phone,
        taxIdentifier: fixture.taxId,
      },
      update: {
        deletedAt: null,
        documentsStatus: "VERIFIED",
        publicName: fixture.name,
        status: SellerStatus.APPROVED,
      },
      where: { id: fixture.id },
    });

    if (sellerUserId && index === 0) {
      await prisma.sellerUser.upsert({
        create: {
          sellerId: seller.id,
          sellerRole: SellerUserRole.OWNER,
          userId: sellerUserId,
        },
        update: { isActive: true, sellerRole: SellerUserRole.OWNER },
        where: {
          sellerId_userId: { sellerId: seller.id, userId: sellerUserId },
        },
      });
    }

    const store = await prisma.store.upsert({
      create: {
        cityId: city.id,
        coverImageObjectKey: fixture.cover,
        defaultPreparationMinutes: 35 + index * 10,
        description: fixture.description,
        isActive: true,
        isOpen: index !== 3,
        logoObjectKey: fixture.logo,
        minimumOrderAmount: index === 2 ? "100.00" : "80.00",
        name: fixture.name,
        phoneE164: fixture.phone,
        ratingAverage: fixture.rating,
        ratingCount: fixture.ratingCount,
        sellerId: seller.id,
        slug: fixture.slug,
        status: StoreStatus.ACTIVE,
      },
      update: {
        coverImageObjectKey: fixture.cover,
        deletedAt: null,
        description: fixture.description,
        isActive: true,
        logoObjectKey: fixture.logo,
        ratingAverage: fixture.rating,
        ratingCount: fixture.ratingCount,
        status: StoreStatus.ACTIVE,
      },
      where: { cityId_slug: { cityId: city.id, slug: fixture.slug } },
    });

    await prisma.storeAddress.upsert({
      create: {
        cityId: city.id,
        latitude: fixture.lat,
        line1: fixture.address,
        longitude: fixture.lng,
        storeId: store.id,
      },
      update: {
        cityId: city.id,
        latitude: fixture.lat,
        line1: fixture.address,
        longitude: fixture.lng,
      },
      where: { storeId: store.id },
    });
    stores.push({ id: store.id, slug: store.slug });
  }

  let globalIndex = 0;
  for (const category of categoryFixtures) {
    const names = productsByCategory[category.slug];
    const categoryId = categories.get(category.slug);
    if (!categoryId) throw new Error(`Missing category ${category.slug}`);

    for (const [index, name] of names.entries()) {
      const store = stores[globalIndex % stores.length];
      if (!store) throw new Error("Marketplace seed requires stores");
      const price = 75 + ((globalIndex * 17) % 23) * 10;
      const slug = productSlug(name, category.slug, index);
      const product = await prisma.product.upsert({
        create: {
          categoryId,
          compareAtPrice: globalIndex % 4 === 0 ? `${price + 35}.00` : null,
          currencyCode: "TJS",
          description: `${name} — выразительный подарок, собранный вручную в Душанбе. Аккуратная упаковка и открытка включены.`,
          isFeatured: globalIndex % 5 === 0,
          moderatedAt: new Date("2026-09-15T09:00:00.000Z"),
          name,
          preparationTimeMinutes: 30 + (globalIndex % 4) * 15,
          price: `${price}.00`,
          ratingAverage: (4.55 + (globalIndex % 9) * 0.05).toFixed(2),
          ratingCount: 8 + ((globalIndex * 7) % 89),
          slug,
          status: ProductStatus.ACTIVE,
          stockQuantity: 6 + (globalIndex % 19),
          storeId: store.id,
        },
        update: {
          categoryId,
          deletedAt: null,
          isFeatured: globalIndex % 5 === 0,
          name,
          price: `${price}.00`,
          status: ProductStatus.ACTIVE,
          stockQuantity: 6 + (globalIndex % 19),
          storeId: store.id,
        },
        where: { slug },
      });

      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { productId: product.id } }),
        prisma.productVariant.deleteMany({ where: { productId: product.id } }),
      ]);
      await prisma.productImage.createMany({
        data: [0, 1].map((imageIndex) => ({
          altText: `${name}, вид ${imageIndex + 1}`,
          height: 1200,
          isPrimary: imageIndex === 0,
          mimeType: "image/svg+xml",
          objectKey: `/images/products/${category.slug}.svg`,
          productId: product.id,
          sortOrder: imageIndex,
          width: 1200,
        })),
      });
      await prisma.productVariant.createMany({
        data: [
          {
            name: "Стандарт",
            productId: product.id,
            reservedQuantity: 0,
            sku: `${category.slug.toUpperCase()}-${globalIndex + 1}-S`,
            sortOrder: 0,
            stockQuantity: 6 + (globalIndex % 19),
          },
          {
            name: "Большой",
            priceDelta: "45.00",
            productId: product.id,
            reservedQuantity: 0,
            sku: `${category.slug.toUpperCase()}-${globalIndex + 1}-L`,
            sortOrder: 1,
            stockQuantity: 3 + (globalIndex % 11),
          },
        ],
      });
      globalIndex += 1;
    }
  }
}
