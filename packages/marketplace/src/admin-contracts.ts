import {
  CourierStatus,
  OrderStatus,
  ProductStatus,
  SellerStatus,
  StoreStatus,
  UserStatus,
} from "@nozi/database";
import { z } from "zod";

export const adminPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(160).default(""),
});
export const adminOrderFilterSchema = adminPageSchema.extend({
  courierId: z.string().uuid().optional(),
  from: z.iso.date().optional(),
  status: z.enum(["ALL", ...Object.values(OrderStatus)]).default("ALL"),
  storeId: z.string().uuid().optional(),
  to: z.iso.date().optional(),
});
export const adminCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export const courierAssignmentSchema = z.object({
  courierId: z.string().uuid(),
});
export const adminNoteSchema = z.object({
  body: z.string().trim().min(2).max(2000),
});
export const courierCreateSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2).max(160),
  phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/),
  status: z.enum(CourierStatus).default(CourierStatus.OFFLINE),
  transportType: z.string().trim().max(50).nullable().optional(),
});
export const courierUpdateSchema = z.object({
  isActive: z.boolean(),
  status: z.enum(CourierStatus),
  transportType: z.string().trim().max(50).nullable().optional(),
});
export const sellerAdminUpdateSchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
  status: z.enum(SellerStatus),
});
export const storeAdminUpdateSchema = z.object({
  commissionRate: z
    .string()
    .regex(/^\d{1,2}(?:\.\d{1,2})?$/)
    .optional(),
  isActive: z.boolean().optional(),
  status: z.enum(StoreStatus).optional(),
});
export const productModerationSchema = z.object({
  note: z.string().trim().max(500).optional(),
  status: z.enum(ProductStatus),
});
export const customerAdminUpdateSchema = z.object({
  status: z.enum(UserStatus),
});
export const categoryCreateSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  parentId: z.string().uuid().nullable().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(140),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});
export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export const financeRangeSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const auditFilterSchema = adminPageSchema.extend({
  action: z.string().trim().max(100).optional(),
  actorUserId: z.string().uuid().optional(),
  from: z.iso.date().optional(),
  subjectType: z.string().trim().max(100).optional(),
  to: z.iso.date().optional(),
});
