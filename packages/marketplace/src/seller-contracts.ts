import { OrderStatus, ProductStatus } from "@nozi/database";
import { z } from "zod";

const money = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Введите корректную сумму")
  .transform((value) => Number(value).toFixed(2));
const optionalMoney = z
  .union([money, z.literal("")])
  .transform((value) => (value === "" ? null : value));
const slug = z
  .string()
  .trim()
  .min(2)
  .max(220)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Используйте латиницу, цифры и дефисы");
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/);

export const sellerOrderFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z
    .enum([
      "ALL",
      OrderStatus.AWAITING_SELLER_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.CANCELLED,
      OrderStatus.DELIVERED,
    ])
    .default("ALL"),
});

export const sellerProductFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  storeId: z.string().uuid().optional(),
});

export const rejectionReasonSchema = z.object({
  note: z.string().trim().max(500).optional(),
  reason: z.enum([
    "OUT_OF_STOCK",
    "STORE_CLOSED",
    "CANNOT_PREPARE_IN_TIME",
    "INVALID_ORDER",
    "OTHER",
  ]),
});

export const sellerOrderActionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

const productVariantSchema = z.object({
  absolutePrice: optionalMoney.optional(),
  id: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
  name: z.string().trim().min(1).max(160),
  priceDelta: money.default("0.00"),
  sku: z.string().trim().max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  stockQuantity: z.number().int().min(0).max(1_000_000),
});

const productImageSchema = z.object({
  altText: z.string().trim().min(1).max(240),
  id: z.string().uuid().optional(),
  isPrimary: z.boolean().default(false),
  objectKey: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const sellerProductInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    compareAtPrice: optionalMoney.optional(),
    description: z.string().trim().min(20).max(5000),
    images: z.array(productImageSchema).max(12).default([]),
    name: z.string().trim().min(2).max(200),
    preparationTimeMinutes: z.number().int().min(5).max(1440).nullable(),
    price: money,
    slug,
    status: z.enum([ProductStatus.DRAFT, ProductStatus.ACTIVE]),
    stockQuantity: z.number().int().min(0).max(1_000_000),
    storeId: z.string().uuid(),
    variants: z.array(productVariantSchema).max(50).default([]),
    version: z.number().int().positive().optional(),
  })
  .refine(
    ({ compareAtPrice, price }) =>
      compareAtPrice === null ||
      compareAtPrice === undefined ||
      Number(compareAtPrice) > Number(price),
    {
      message: "Старая цена должна быть выше текущей",
      path: ["compareAtPrice"],
    },
  );

const openingHourSchema = z
  .object({
    closesAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    dayOfWeek: z.number().int().min(1).max(7),
    isClosed: z.boolean(),
    opensAt: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
  })
  .refine(
    ({ closesAt, isClosed, opensAt }) =>
      isClosed || (opensAt !== null && closesAt !== null && opensAt < closesAt),
    { message: "Проверьте время открытия и закрытия" },
  );

export const sellerStoreUpdateSchema = z.object({
  defaultPreparationMinutes: z.number().int().min(5).max(1440),
  deliveryFeeAmount: money,
  description: z.string().trim().min(20).max(5000),
  isOpen: z.boolean(),
  isTemporarilyPaused: z.boolean(),
  minimumOrderAmount: money,
  name: z.string().trim().min(2).max(160),
  openingHours: z.array(openingHourSchema).length(7),
  pauseReason: z.string().trim().max(300).nullable(),
  phoneE164: phone,
});

export type SellerOrderFilter = z.infer<typeof sellerOrderFilterSchema>;
export type SellerProductFilter = z.infer<typeof sellerProductFilterSchema>;
export type SellerProductInput = z.infer<typeof sellerProductInputSchema>;
export type SellerStoreUpdate = z.infer<typeof sellerStoreUpdateSchema>;
