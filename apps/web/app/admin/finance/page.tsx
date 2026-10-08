import { Permission } from "@nozi/auth";
import { financeRangeSchema, getFinanceOverview } from "@nozi/marketplace";
import { requireAdminPageActor } from "../../../lib/require-admin-page";
export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const range = financeRangeSchema.parse({ from: raw.from, to: raw.to });
  const data = await getFinanceOverview(
    await requireAdminPageActor(Permission.FinanceRead),
    range,
  );
  const cards = [
    ["GMV", data.gmv],
    ["Commission", data.marketplaceCommission],
    ["Seller amount", data.sellerAmount],
    ["Delivery fees", data.deliveryFees],
    ["Refunds", data.refunds],
  ];
  return (
    <>
      <div>
        <p className="text-xs font-bold tracking-[.18em] text-[#a22f59] uppercase">
          Finance & ledger
        </p>
        <h1 className="mt-2 text-4xl font-semibold">Финансы</h1>
      </div>
      <form className="mt-5 flex gap-3">
        <input
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={range.from}
          name="from"
          type="date"
        />
        <input
          className="rounded-xl border bg-white px-4 py-3"
          defaultValue={range.to}
          name="to"
          type="date"
        />
        <button className="rounded-xl bg-[#172131] px-5 text-white">
          Период
        </button>
      </form>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <article className="rounded-2xl border bg-white p-5" key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <strong className="mt-2 block text-2xl">{value} TJS</strong>
          </article>
        ))}
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[.6fr_1.4fr]">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Payments</h2>
          {data.paymentBreakdown.map((p) => (
            <p className="mt-4 flex justify-between" key={p.status}>
              <span>
                {p.status} · {p.count}
              </span>
              <strong>{p.amount} TJS</strong>
            </p>
          ))}
        </section>
        <section className="overflow-hidden rounded-2xl border bg-white">
          <h2 className="border-b p-5 text-xl font-semibold">
            Double-entry ledger
          </h2>
          <div className="divide-y">
            {data.ledger.map((t) => (
              <div
                className="grid gap-2 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto]"
                key={t.id}
              >
                <span>
                  <strong>{t.eventType}</strong>
                  <small className="block text-slate-500">
                    {t.description}
                  </small>
                </span>
                <span>Debit {t.debit}</span>
                <span>Credit {t.credit}</span>
                <span
                  className={
                    t.balanced
                      ? "font-bold text-emerald-700"
                      : "font-bold text-rose-700"
                  }
                >
                  {t.balanced ? "Balanced" : "UNBALANCED"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
