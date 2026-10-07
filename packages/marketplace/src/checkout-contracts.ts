import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use international phone format, for example +992900001234",
  );
const optionalShortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const checkoutSchema = z
  .object({
    anonymousDelivery: z.boolean().default(false),
    apartment: optionalShortText(40),
    buyerName: z.string().trim().min(2).max(160),
    buyerPhone: phoneSchema,
    customerNote: optionalShortText(500),
    deliveryAddress: z.string().trim().min(5).max(240),
    deliveryDate: z.iso.date(),
    deliveryNote: optionalShortText(500),
    deliveryWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    deliveryWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    entrance: optionalShortText(40),
    floor: optionalShortText(20),
    giftMessage: optionalShortText(500),
    paymentMethod: z.enum(["CASH", "TEST"]),
    recipientName: z.string().trim().min(2).max(160),
    recipientPhone: phoneSchema,
  })
  .refine(
    ({ deliveryWindowEnd, deliveryWindowStart }) =>
      deliveryWindowEnd > deliveryWindowStart,
    {
      message: "Delivery window end must be after its start",
      path: ["deliveryWindowEnd"],
    },
  );

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export type CheckoutInput = z.infer<typeof checkoutSchema>;
