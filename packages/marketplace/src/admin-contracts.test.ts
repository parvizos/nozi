import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ProductStatus } from "@nozi/database";

import {
  customerAdminUpdateSchema,
  failedDeliveryRetrySchema,
  productModerationSchema,
} from "./admin-contracts";
import { checkoutSchema } from "./checkout-contracts";

describe("operational mutation contracts", () => {
  it("rejects equal and cross-midnight windows at checkout and retry", () => {
    const checkout = {
      anonymousDelivery: false,
      buyerName: "Pilot Customer",
      buyerPhone: "+992900001234",
      deliveryAddress: "Rudaki Avenue 100",
      deliveryDate: "2026-10-11",
      deliveryWindowEnd: "01:00",
      deliveryWindowStart: "23:30",
      paymentMethod: "CASH",
      recipientName: "Pilot Recipient",
      recipientPhone: "+992900004321",
    };
    expect(checkoutSchema.safeParse(checkout).success).toBe(false);
    expect(
      checkoutSchema.safeParse({
        ...checkout,
        deliveryWindowEnd: "10:00",
        deliveryWindowStart: "10:00",
      }).success,
    ).toBe(false);
    expect(
      failedDeliveryRetrySchema.safeParse({
        courierId: randomUUID(),
        deliveryDate: "2026-10-11",
        deliveryWindowEnd: "01:00",
        deliveryWindowStart: "23:30",
      }).success,
    ).toBe(false);
  });

  it("requires real reasons for customer suspension and product rejection", () => {
    expect(
      customerAdminUpdateSchema.safeParse({
        reason: "",
        status: "SUSPENDED",
      }).success,
    ).toBe(false);
    expect(
      productModerationSchema.safeParse({ status: ProductStatus.REJECTED })
        .success,
    ).toBe(false);
  });
});
