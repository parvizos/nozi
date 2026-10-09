import type { Metadata } from "next";
import Link from "next/link";

import { PhoneAuthForm } from "../../components/phone-auth-form";

export const metadata: Metadata = {
  title: "Регистрация",
  robots: { index: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = (await searchParams).returnTo ?? "/";
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
          Новый покупатель
        </p>
        <h1 className="display-font mt-2 text-4xl">Начнём с телефона</h1>
        <p className="mt-3 text-sm leading-6 text-[#756865]">
          Мы отправим одноразовый код. Пароль для покупок не нужен.
        </p>
        <PhoneAuthForm returnTo={returnTo} />
      </div>
    </main>
  );
}
