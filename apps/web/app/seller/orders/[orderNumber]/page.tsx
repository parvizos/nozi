import Link from "next/link";
import { notFound } from "next/navigation";
import { getSellerOrder, MarketplaceError } from "@nozi/marketplace";
import {
  formatMarketplaceDateTime,
  orderStatusMetadata,
} from "@nozi/marketplace/display";
import { SellerOrderActions } from "../../../../components/seller-order-actions";
import { ReturnedInventoryActions } from "../../../../components/returned-inventory-actions";
import { requireSellerPageActor } from "../../../../lib/require-seller-page";

const actions: Record<string, ("accept" | "prepare" | "ready" | "reject")[]> = {
  AWAITING_SELLER_CONFIRMATION: ["accept", "reject"],
  CONFIRMED: ["prepare"],
  PREPARING: ["ready"],
};
export default async function SellerOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  let order;
  try {
    order = await getSellerOrder(
      await requireSellerPageActor(),
      (await params).orderNumber,
    );
  } catch (error) {
    if (error instanceof MarketplaceError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link
        className="text-sm font-semibold text-[#8f2d56]"
        href="/seller/orders"
      >
        ← Все заказы
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm text-[#756e69]">{order.store.name}</p>
          <h1 className="mt-1 text-4xl font-semibold">{order.orderNumber}</h1>
          <span className="mt-3 inline-flex rounded-full bg-[#f2e3e9] px-4 py-2 text-sm font-bold text-[#8f2d56]">
            {orderStatusMetadata[order.status].label}
          </span>
        </div>
        <SellerOrderActions
          allowed={actions[order.status] ?? []}
          orderNumber={order.orderNumber}
          version={order.version}
        />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
            <h2 className="text-xl font-semibold">Состав заказа</h2>
            <div className="mt-4 divide-y">
              {order.items.map((item) => (
                <div className="flex justify-between gap-5 py-4" key={item.id}>
                  <div>
                    <strong>{item.productName}</strong>
                    {item.variantName ? (
                      <p className="text-sm text-[#756e69]">
                        {item.variantName}
                        {item.sku ? ` · ${item.sku}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm">
                      {item.quantity} × {item.unitPrice} {item.currencyCode}
                    </p>
                  </div>
                  <strong>
                    {item.lineTotal} {item.currencyCode}
                  </strong>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t pt-4 text-sm">
              <p className="flex justify-between">
                <span>Товары</span>
                <strong>
                  {order.itemsSubtotal} {order.currencyCode}
                </strong>
              </p>
              <p className="flex justify-between">
                <span>Доставка</span>
                <strong>
                  {order.deliveryFee} {order.currencyCode}
                </strong>
              </p>
              <p className="flex justify-between text-lg">
                <span>Итого</span>
                <strong>
                  {order.grandTotal} {order.currencyCode}
                </strong>
              </p>
            </div>
          </section>
          <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
            <h2 className="text-xl font-semibold">Получатель и доставка</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold text-[#817974] uppercase">
                  Получатель
                </dt>
                <dd className="mt-1">
                  {order.recipientName}
                  <br />
                  <a href={`tel:${order.recipientPhoneE164}`}>
                    {order.recipientPhoneE164}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-[#817974] uppercase">
                  Время
                </dt>
                <dd className="mt-1">
                  {order.requestedDeliveryDate}
                  <br />
                  {order.requestedDeliveryWindowStart}–
                  {order.requestedDeliveryWindowEnd}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-bold text-[#817974] uppercase">
                  Адрес
                </dt>
                <dd className="mt-1">
                  {order.deliveryAddress?.line1}
                  {order.deliveryAddress?.apartment
                    ? `, кв. ${order.deliveryAddress.apartment}`
                    : ""}
                  {order.deliveryAddress?.entrance
                    ? `, подъезд ${order.deliveryAddress.entrance}`
                    : ""}
                  {order.deliveryAddress?.floor
                    ? `, этаж ${order.deliveryAddress.floor}`
                    : ""}
                </dd>
              </div>
            </dl>
            {order.customerNote ? (
              <p className="mt-4 rounded-xl bg-[#f8f5f1] p-4 text-sm">
                <strong>Комментарий:</strong> {order.customerNote}
              </p>
            ) : null}
            {order.giftMessage ? (
              <p className="mt-3 rounded-xl bg-[#f8edf1] p-4 text-sm">
                <strong>Открытка:</strong> {order.giftMessage}{" "}
                {order.anonymousDelivery ? "(анонимно)" : ""}
              </p>
            ) : null}
          </section>
        </div>
        <aside className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">История</h2>
          <ol className="mt-5 space-y-5 border-l-2 border-[#e8dbe0] pl-5">
            {order.statusHistory.map((entry) => (
              <li key={entry.id}>
                <p className="font-semibold">
                  {orderStatusMetadata[entry.newStatus].label}
                </p>
                <p className="mt-1 text-xs text-[#756e69]">
                  {formatMarketplaceDateTime(entry.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  · {entry.actorType}
                </p>
                {entry.note ? (
                  <p className="mt-1 text-sm">{entry.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {order.status === "RETURNED_TO_STORE" &&
      order.returnDispositions.some((item) => item.decision === null) ? (
        <div className="mt-6 max-w-xl">
          <ReturnedInventoryActions
            endpoint={`/api/v1/seller/orders/${order.orderNumber}/inventory-disposition`}
          />
        </div>
      ) : null}
    </>
  );
}
