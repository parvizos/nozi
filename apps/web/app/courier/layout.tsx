import type { ReactNode } from "react";
import { AuthorizationError } from "@nozi/auth";
import { getCourierShell } from "@nozi/marketplace";
import { forbidden } from "next/navigation";

import { CourierNavigation } from "../../components/courier-navigation";
import { requireCourierPageActor } from "../../lib/require-courier-page";

export const dynamic = "force-dynamic";

export default async function CourierLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await requireCourierPageActor();
  let courier;
  try {
    courier = await getCourierShell(actor);
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
  return (
    <div className="min-h-screen bg-[#f1f7f4] text-[#18372b]">
      <CourierNavigation courier={courier} />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-28">{children}</main>
    </div>
  );
}
