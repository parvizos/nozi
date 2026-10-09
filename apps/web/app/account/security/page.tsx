import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActorContext } from "@nozi/auth";
import { prisma } from "@nozi/database";

import { LogoutButton } from "../../../components/logout-button";
import { SiteHeader } from "../../../components/site-header";

export const metadata: Metadata = {
  title: "Безопасность аккаунта",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const actor = await getActorContext(await headers());
  if (!actor) redirect("/sign-in?callbackUrl=/account/security");
  const user = await prisma.user.findUniqueOrThrow({
    select: { email: true, phoneNumber: true, phoneNumberVerified: true },
    where: { id: actor.userId },
  });
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Личный кабинет
        </p>
        <h1 className="display-font mt-2 text-4xl">Безопасность</h1>
        <section className="mt-8 rounded-3xl border border-[#e4d7d2] bg-white p-6">
          <h2 className="font-semibold">Способы входа</h2>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="text-[#756865]">Телефон</dt>
              <dd className="mt-1 font-medium">
                {user.phoneNumber ?? "Не добавлен"}{" "}
                {user.phoneNumberVerified ? "· подтверждён" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[#756865]">Email для служебного входа</dt>
              <dd className="mt-1 font-medium">
                {user.email.endsWith("@identity.nozi.invalid")
                  ? "Не используется"
                  : user.email}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-[#756865]">
            Восстановление доступа покупателя выполняется новым OTP на
            подтверждённый телефон. Пароли администраторов и продавцов
            продолжают обслуживаться Better Auth.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </section>
      </main>
    </>
  );
}
