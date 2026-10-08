import { LedgerDirection, LedgerOwnerType } from "@nozi/database";
import type { Prisma } from "@nozi/database";

type Tx = Prisma.TransactionClient;

async function account(
  tx: Tx,
  input: {
    accountType: string;
    currencyCode: string;
    name: string;
    ownerId: string | null;
    ownerType: LedgerOwnerType;
  },
) {
  const existing = await tx.ledgerAccount.findFirst({ where: input });
  return existing ?? tx.ledgerAccount.create({ data: input });
}

export async function postOrderLedger(
  tx: Tx,
  input: {
    commissionAmount: Prisma.Decimal;
    currencyCode: string;
    deliveryFee: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
    itemsSubtotal: Prisma.Decimal;
    orderId: string;
    sellerId: string;
  },
): Promise<void> {
  const existing = await tx.ledgerTransaction.count({
    where: {
      eventType: "ORDER_PLACED",
      referenceId: input.orderId,
      referenceType: "ORDER",
    },
  });
  if (existing) return;
  const [clearing, sellerPayable, commissionRevenue, deliveryRevenue] =
    await Promise.all([
      account(tx, {
        accountType: "PAYMENT_CLEARING",
        currencyCode: input.currencyCode,
        name: "Payment clearing",
        ownerId: null,
        ownerType: LedgerOwnerType.PLATFORM,
      }),
      account(tx, {
        accountType: "SELLER_PAYABLE",
        currencyCode: input.currencyCode,
        name: "Seller payable",
        ownerId: input.sellerId,
        ownerType: LedgerOwnerType.SELLER,
      }),
      account(tx, {
        accountType: "COMMISSION_REVENUE",
        currencyCode: input.currencyCode,
        name: "Marketplace commission",
        ownerId: null,
        ownerType: LedgerOwnerType.PLATFORM,
      }),
      account(tx, {
        accountType: "DELIVERY_REVENUE",
        currencyCode: input.currencyCode,
        name: "Delivery fees",
        ownerId: null,
        ownerType: LedgerOwnerType.PLATFORM,
      }),
    ]);
  const sellerAmount = input.itemsSubtotal.sub(input.commissionAmount);
  await tx.ledgerTransaction.create({
    data: {
      currencyCode: input.currencyCode,
      description: "Order financial recognition",
      effectiveAt: new Date(),
      entries: {
        create: [
          {
            amount: input.grandTotal,
            direction: LedgerDirection.DEBIT,
            ledgerAccountId: clearing.id,
          },
          {
            amount: sellerAmount,
            direction: LedgerDirection.CREDIT,
            ledgerAccountId: sellerPayable.id,
          },
          {
            amount: input.commissionAmount,
            direction: LedgerDirection.CREDIT,
            ledgerAccountId: commissionRevenue.id,
          },
          {
            amount: input.deliveryFee,
            direction: LedgerDirection.CREDIT,
            ledgerAccountId: deliveryRevenue.id,
          },
        ],
      },
      eventType: "ORDER_PLACED",
      referenceId: input.orderId,
      referenceType: "ORDER",
    },
  });
}

export async function reverseOrderLedger(
  tx: Tx,
  orderId: string,
  createdByUserId: string | null,
): Promise<void> {
  const original = await tx.ledgerTransaction.findUnique({
    include: { entries: true },
    where: {
      referenceType_referenceId_eventType: {
        eventType: "ORDER_PLACED",
        referenceId: orderId,
        referenceType: "ORDER",
      },
    },
  });
  if (!original) return;
  const existing = await tx.ledgerTransaction.count({
    where: {
      eventType: "ORDER_CANCELLED",
      referenceId: orderId,
      referenceType: "ORDER",
    },
  });
  if (existing) return;
  await tx.ledgerTransaction.create({
    data: {
      createdByUserId,
      currencyCode: original.currencyCode,
      description: "Order cancellation reversal",
      effectiveAt: new Date(),
      entries: {
        create: original.entries.map((entry) => ({
          amount: entry.amount,
          direction:
            entry.direction === LedgerDirection.DEBIT
              ? LedgerDirection.CREDIT
              : LedgerDirection.DEBIT,
          ledgerAccountId: entry.ledgerAccountId,
        })),
      },
      eventType: "ORDER_CANCELLED",
      referenceId: orderId,
      referenceType: "ORDER",
      reversesTransactionId: original.id,
    },
  });
}
