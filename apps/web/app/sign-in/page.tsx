import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "../../components/sign-in-form";
import { PhoneAuthForm } from "../../components/phone-auth-form";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const callbackUrl = (await searchParams).callbackUrl ?? "/";
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5e8e5] px-4 py-12">
      <div className="surface-shadow w-full max-w-md rounded-[2rem] bg-[#fffaf7] p-7 sm:p-10">
        <Link
          className="display-font text-3xl font-bold tracking-[-0.08em] text-[#7f254a]"
          href="/"
        >
          NOZI.
        </Link>
        <p className="mt-8 text-xs font-bold tracking-[0.16em] text-[#8f2d56] uppercase">
          Личный кабинет
        </p>
        <h1 className="display-font mt-2 text-4xl">С возвращением</h1>
        <p className="mt-3 text-sm leading-6 text-[#756865]">
          Войдите, чтобы сохранять любимые подарки и позже следить за заказами.
        </p>
        <PhoneAuthForm returnTo={callbackUrl} />
        <div className="my-6 flex items-center gap-3 text-xs text-[#9b8e89]">
          <span className="h-px flex-1 bg-[#e4d7d2]" />
          для команды NOZI
          <span className="h-px flex-1 bg-[#e4d7d2]" />
        </div>
        <SignInForm callbackUrl={callbackUrl} />
        <Link
          className="mt-5 block text-center text-sm font-semibold text-[#8f2d56]"
          href={`/sign-up?returnTo=${encodeURIComponent(callbackUrl)}`}
        >
          Создать аккаунт покупателя
        </Link>
        {process.env.NODE_ENV === "development" ? (
          <p className="mt-5 text-center text-xs text-[#8b7c77]">
            Development account: customer@nozi.local
          </p>
        ) : null}
      </div>
    </main>
  );
}
