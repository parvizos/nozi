import {
  PaymentMethod,
  PaymentProviderCode,
  PaymentStatus,
} from "@nozi/database";

export type PaymentIntentInput = {
  amount: string;
  currencyCode: string;
  idempotencyKey: string;
  orderId: string;
};

export type PaymentIntentResult = {
  authorizedAt: Date | null;
  paidAt: Date | null;
  provider: PaymentProviderCode;
  providerReference: string;
  status: PaymentStatus;
};

export interface PaymentProvider {
  readonly method: PaymentMethod;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
}

export class CashPaymentProvider implements PaymentProvider {
  readonly method = PaymentMethod.CASH;

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      authorizedAt: null,
      paidAt: null,
      provider: PaymentProviderCode.CASH,
      providerReference: `cash:${input.orderId}`,
      status: PaymentStatus.PENDING,
    };
  }
}

export class TestPaymentProvider implements PaymentProvider {
  readonly method = PaymentMethod.TEST;

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const now = new Date();
    return {
      authorizedAt: now,
      paidAt: now,
      provider: PaymentProviderCode.TEST,
      providerReference: `test:${input.orderId}`,
      status: PaymentStatus.PAID,
    };
  }
}

const providers = new Map<PaymentMethod, PaymentProvider>([
  [PaymentMethod.CASH, new CashPaymentProvider()],
  [PaymentMethod.TEST, new TestPaymentProvider()],
]);

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  const provider = providers.get(method);
  if (!provider) throw new Error(`Payment method ${method} is not available`);
  return provider;
}
