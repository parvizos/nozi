import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { getNotificationSummary } from "@nozi/notifications";
import { formatMarketplaceDateTime } from "@nozi/marketplace/display";

import { NotificationActions } from "../../components/notification-actions";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Уведомления",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const actor = await getActorContext(await headers());
  if (!actor) redirect("/sign-in?callbackUrl=/notifications");
  const summary = await getNotificationSummary(actor);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
              NOZI
            </p>
            <h1 className="display-font mt-2 text-4xl">Уведомления</h1>
          </div>
          {summary.unread > 0 ? <NotificationActions /> : null}
        </div>
        {summary.items.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-dashed border-[#d9c8c1] bg-white px-6 py-16 text-center">
            <p className="display-font text-2xl">Здесь пока тихо</p>
            <p className="mt-2 text-sm text-[#756865]">
              Статусы заказов и важные события появятся здесь.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {summary.items.map((item) => (
              <article
                className={`rounded-3xl border p-5 ${item.readAt ? "border-[#eadfda] bg-white/70" : "border-[#c989a2] bg-white"}`}
                key={item.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-[#655754]">
                      {item.body}
                    </p>
                    <time className="mt-2 block text-xs text-[#948681]">
                      {formatMarketplaceDateTime(item.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {!item.readAt ? (
                    <NotificationActions notificationId={item.id} />
                  ) : null}
                </div>
                {item.resourceType === "Order" && item.resourceId ? (
                  <Link
                    className="mt-3 inline-block text-sm font-semibold text-[#8f2d56]"
                    href={`/orders/${item.resourceId}`}
                  >
                    Открыть заказ →
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
