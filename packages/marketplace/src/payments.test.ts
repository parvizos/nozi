import { describe, expect, it } from "vitest";

import { PaymentMethod } from "@nozi/database";

import { CashPaymentProvider, testPaymentsEnabled } from "./payments";

describe("payment provider policy", () => {
  it("allows TEST only in non-production with the explicit flag", () => {
    expect(
      testPaymentsEnabled({
        ENABLE_TEST_PAYMENTS: true,
        NODE_ENV: "development",
      }),
    ).toBe(true);
    expect(
      testPaymentsEnabled({
        ENABLE_TEST_PAYMENTS: false,
        NODE_ENV: "development",
      }),
    ).toBe(false);
    expect(
      testPaymentsEnabled({
        ENABLE_TEST_PAYMENTS: true,
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });

  it("keeps cash pending and independent of the test flag", async () => {
    const result = await new CashPaymentProvider().createIntent({
      amount: "49.50",
      currencyCode: "TJS",
      idempotencyKey: "cash-test-key-1234",
      orderId: "00000000-0000-4000-8000-000000000001",
    });
    expect(new CashPaymentProvider().method).toBe(PaymentMethod.CASH);
    expect(result.status).toBe("PENDING");
  });
});
