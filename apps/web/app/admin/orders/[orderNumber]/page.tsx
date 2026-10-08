import Link from "next/link";
import { Permission } from "@nozi/auth";
import { getAdminOrder, listCouriers } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../../lib/require-admin-page";
import { AdminOrderActions } from "../../../../components/admin-order-actions";
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const actor = await requireAdminPageActor(Permission.OrdersRead);
  const [order, courierRows] = await Promise.all([
    getAdminOrder(actor, (await params).orderNumber),
    actor.permissions.has(Permission.CouriersManage)
      ? listCouriers(actor)
      : Promise.resolve([]),
  ]);
  const currentCourierIds = new Set(
    order.courierAssignments
      .filter((assignment) => assignment.status === "DELIVERY_FAILED")
      .map((assignment) => assignment.courierId),
  );
  const couriers = courierRows
    .filter(
      (c) =>
        c.isActive && (c.status === "AVAILABLE" || currentCourierIds.has(c.id)),
    )
    .map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <Link
        className="text-sm font-semibold text-[#a22f59]"
        href="/admin/orders"
      >
        ← Live orders
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm text-slate-500">
            {order.store.name} · {order.store.seller.publicName}
          </p>
          <h1 className="mt-1 text-4xl font-semibold">{order.orderNumber}</h1>
          <span className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold shadow-sm">
            {order.status}
          </span>
        </div>
        {actor.permissions.has(Permission.OrdersManage) ? (
          <div className="min-w-[340px] rounded-2xl border bg-white p-4">
            <AdminOrderActions
              couriers={couriers}
              orderNumber={order.orderNumber}
              status={order.status}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.2fr_.8fr_.75fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-semibold">Заказ</h2>
            <div className="mt-4 divide-y">
              {order.items.map((i) => (
                <div className="flex justify-between py-3" key={i.id}>
                  <span>
                    <strong>{i.productName}</strong>
                    <small className="block text-slate-500">
                      {i.variantName ?? "Без варианта"} · {i.quantity} шт.
                    </small>
                  </span>
                  <strong>
                    {i.lineTotal} {i.currencyCode}
                  </strong>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt>Товары</dt>
                <dd>{order.itemsSubtotal}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Доставка</dt>
                <dd>{order.deliveryFee}</dd>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <dt>Итого</dt>
                <dd>
                  {order.grandTotal} {order.currencyCode}
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-semibold">Доставка и PII</h2>
            <p className="mt-4">
              <strong>{order.recipientName}</strong> ·{" "}
              {order.recipientPhoneE164}
            </p>
            <p className="mt-2 text-slate-600">
              {order.deliveryAddress?.line1}, {order.deliveryAddress?.cityName}
            </p>
            <p className="mt-2 text-sm">
              Покупатель: {order.customer.name} · {order.customer.email} ·{" "}
              {order.buyerPhoneE164}
            </p>
          </section>
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-semibold">Finance</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Payment</dt>
                <dd>{order.payment?.status ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Commission</dt>
                <dd>{order.commission?.commissionAmount ?? "0.00"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Rate</dt>
                <dd>{order.commission?.rate ?? "—"}%</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-semibold">Courier</h2>
            {order.courierAssignments.length ? (
              order.courierAssignments.map((a) => (
                <p className="mt-3 text-sm" key={a.id}>
                  <strong>{a.courier.name}</strong>
                  <br />
                  {a.status} ·{" "}
                  {new Intl.DateTimeFormat("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(a.assignedAt)}
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-slate-500">Не назначен</p>
            )}
          </section>
          <section className="rounded-2xl border bg-amber-50 p-6">
            <h2 className="font-semibold">Internal notes</h2>
            {order.adminNotes.map((n) => (
              <p className="mt-3 text-sm" key={n.id}>
                {n.body}
                <small className="block text-slate-500">{n.author.name}</small>
              </p>
            ))}
          </section>
        </div>
        <aside className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Timeline & audit</h2>
          <ol className="mt-4 space-y-4 border-l pl-4">
            {order.statusHistory.map((h) => (
              <li key={h.id}>
                <strong className="text-sm">{h.newStatus}</strong>
                <small className="block text-slate-500">
                  {new Intl.DateTimeFormat("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(h.createdAt)}{" "}
                  · {h.changedBy?.name ?? h.actorType}
                </small>
              </li>
            ))}
          </ol>
          <h3 className="mt-7 font-semibold">Audit events</h3>
          {order.auditEvents.map((e) => (
            <p className="mt-3 border-t pt-3 text-xs" key={e.id}>
              <strong>{e.action}</strong>
              <br />
              {e.requestId ?? "no request id"}
            </p>
          ))}
        </aside>
      </div>
    </>
  );
}
