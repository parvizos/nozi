import { z } from "zod";

const optionalMoney = z
  .string()
  .regex(
    /^\d{1,10}(?:\.\d{1,2})?$/,
    "Use a positive amount with up to two decimals",
  )
  .optional();

export const catalogQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(140).optional(),
    maxPrice: optionalMoney,
    minPrice: optionalMoney,
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    query: z.string().trim().max(120).optional(),
    sort: z
      .enum(["recommended", "price-asc", "price-desc", "rating", "newest"])
      .default("recommended"),
    store: z.string().trim().min(1).max(180).optional(),
  })
  .refine(
    ({ maxPrice, minPrice }) =>
      !maxPrice || !minPrice || Number(maxPrice) >= Number(minPrice),
    {
      message: "Maximum price must be greater than minimum price",
      path: ["maxPrice"],
    },
  );

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCatalogSearchParams(
  input: Record<string, string | string[] | undefined>,
): CatalogQuery {
  return catalogQuerySchema.parse({
    category: firstQueryValue(input.category) || undefined,
    maxPrice: firstQueryValue(input.maxPrice) || undefined,
    minPrice: firstQueryValue(input.minPrice) || undefined,
    page: firstQueryValue(input.page) || undefined,
    pageSize: firstQueryValue(input.pageSize) || undefined,
    query: firstQueryValue(input.query) || undefined,
    sort: firstQueryValue(input.sort) || undefined,
    store: firstQueryValue(input.store) || undefined,
  });
}
