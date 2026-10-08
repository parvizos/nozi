import type { ReactNode } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { AuthorizationError, getActorContext } from "@nozi/auth";
import { UserRoleCode } from "@nozi/database";
import { getSellerShell } from "@nozi/marketplace";
import { SellerNavigation } from "../../components/seller-navigation";

export const dynamic = "force-dynamic";
export default async function SellerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const actor = await getActorContext(await headers());
  if (!actor) redirect("/sign-in?callbackUrl=/seller");
  if (!actor.roles.has(UserRoleCode.SELLER)) forbidden();
  let shell;
  try {
    shell = await getSellerShell(actor);
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
  return (
    <div className="min-h-screen bg-[#f5f3ef] text-[#24211f]">
      <SellerNavigation shell={shell} />
      <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
