import type { Metadata } from "next";

import { getNotificationSystemHealth } from "@nozi/notifications";

import { requireAdminPageActor } from "../../../lib/require-admin-page";

export const metadata: Metadata = { title: "Система" };
export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const actor = await requireAdminPageActor();
  const health = await getNotificationSystemHealth(actor);
  const heartbeatAge = health.heartbeatAgeSeconds;
  return (
    <main className="mx-auto max-w-[1500px] px-5 py-8">
      <p className="text-xs font-bold tracking-widest text-pink-400 uppercase">
        Operations
      </p>
      <h1 className="mt-2 text-3xl font-bold">Notification system</h1>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Pending", health.pending],
          ["Processing", health.processing],
          ["Failed", health.failed],
          ["Dead letter", health.deadLetter],
          [
            "Worker heartbeat",
            heartbeatAge === null ? "нет" : `${heartbeatAge} сек.`,
          ],
        ].map(([label, value]) => (
          <section
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            key={label}
          >
            <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {label}
            </p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-400">
        Worker считается operational, когда heartbeat обновляется и dead-letter
        очередь остаётся пустой.
      </p>
    </main>
  );
}
