import { DeliveryFailureReason } from "@nozi/database";
import { z } from "zod";

export const courierDeliveryFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  scope: z.enum(["ACTIVE", "HISTORY"]).default("ACTIVE"),
});

export const courierFailureSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
    reason: z.enum(DeliveryFailureReason),
  })
  .superRefine(({ note, reason }, context) => {
    if (reason === DeliveryFailureReason.OTHER && !note) {
      context.addIssue({
        code: "custom",
        message: "Укажите причину",
        path: ["note"],
      });
    }
  });

export const courierLocationSchema = z.object({
  accuracy: z.number().finite().min(0).max(100_000).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  orderNumber: z.string().trim().min(5).max(32),
});

export type CourierDeliveryFilter = z.infer<typeof courierDeliveryFilterSchema>;
export type CourierFailureInput = z.infer<typeof courierFailureSchema>;
export type CourierLocationInput = z.infer<typeof courierLocationSchema>;
