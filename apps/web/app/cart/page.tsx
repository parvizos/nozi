import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { getCart } from "@nozi/marketplace";

import { CartClient } from "../../components/cart-client";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Корзина",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const actor = await getActorContext(await headers());
  if (!actor?.roles.has(UserRoleCode.CUSTOMER))
    redirect("/sign-in?callbackUrl=/cart");
  const cart = await getCart(actor);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          NOZI Checkout
        </p>
        <h1 className="display-font mt-2 mb-9 text-4xl sm:text-5xl">Корзина</h1>
        <CartClient initialCart={cart} />
      </main>
      <SiteFooter />
    </>
  );
}
