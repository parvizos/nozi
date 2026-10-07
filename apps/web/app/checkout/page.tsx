import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { getCart, getCheckoutCustomerProfile } from "@nozi/marketplace";

import { CheckoutForm } from "../../components/checkout-form";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Оформление заказа",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

function tomorrowInDushanbe(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Dushanbe",
    year: "numeric",
  }).formatToParts(tomorrow);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

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
          defaultPhone={profile.phoneE164 ?? ""}
          minimumDate={tomorrowInDushanbe()}
        />
      </main>
      <SiteFooter />
    </>
  );
}
