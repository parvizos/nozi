import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import {
  getCart,
  getCheckoutCustomerProfile,
  testPaymentsEnabled,
} from "@nozi/marketplace";
import { marketplaceDateInputValue } from "@nozi/marketplace/display";

import { CheckoutForm } from "../../components/checkout-form";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Оформление заказа",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const actor = await getActorContext(await headers());
  if (!actor?.roles.has(UserRoleCode.CUSTOMER))
    redirect("/sign-in?callbackUrl=/checkout");
  const [cart, profile] = await Promise.all([
    getCart(actor),
    getCheckoutCustomerProfile(actor),
  ]);
  if (!cart || cart.items.length === 0) redirect("/cart");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Последний шаг
        </p>
        <h1 className="display-font mt-2 mb-9 text-4xl sm:text-5xl">
          Оформление заказа
        </h1>
        <CheckoutForm
          cart={cart}
          defaultName={profile.name}
          defaultPhone={profile.phoneNumber ?? ""}
          enableTestPayments={testPaymentsEnabled()}
          minimumDate={marketplaceDateInputValue()}
        />
      </main>
      <SiteFooter />
    </>
  );
}
