import type { ReactNode } from "react";
import { requireAdminPageActor } from "../../lib/require-admin-page";
import { AdminNavigation } from "../../components/admin-navigation";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPageActor();
  return (
    <div className="min-h-screen bg-[#eef1f5] text-[#18212f]">
      <AdminNavigation />
      <main className="mx-auto max-w-[1600px] px-5 py-7">{children}</main>
    </div>
  );
}
