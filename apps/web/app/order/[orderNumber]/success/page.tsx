import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { getCustomerOrder, MarketplaceError } from "@nozi/marketplace";

import { OrderView } from "../../../../components/order-view";
import { SiteFooter } from "../../../../components/site-footer";
import { SiteHeader } from "../../../../components/site-header";

export const metadata: Metadata = {
  title: "Заказ оформлен",
  robots: { index: false },
};
export const dynamic = "force-dynamic";
export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const actor = await getActorContext(await headers());
  if (!actor?.roles.has(UserRoleCode.CUSTOMER))
    redirect(
      `/sign-in?callbackUrl=${encodeURIComponent(`/order/${orderNumber}/success`)}`,
    );
  let order;
  try {
    order = await getCustomerOrder(actor, orderNumber);
  } catch (error) {
    if (error instanceof MarketplaceError && error.code === "ORDER_NOT_FOUND")
      notFound();
    throw error;
  }
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <OrderView order={order} success />
      </main>
      <SiteFooter />
    </>
  );
}
