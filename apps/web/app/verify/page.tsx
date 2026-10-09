import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OtpVerifyForm } from "../../components/otp-verify-form";

export const metadata: Metadata = {
  title: "Подтверждение телефона",
  robots: { index: false },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; returnTo?: string }>;
}) {
  const params = await searchParams;
  if (!params.phone) redirect("/sign-in");
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5e8e5] px-4 py-12">
      <div className="surface-shadow w-full max-w-md rounded-[2rem] bg-[#fffaf7] p-7 sm:p-10">
        <Link
          className="display-font text-3xl font-bold tracking-[-0.08em] text-[#7f254a]"
          href="/"
        >
          NOZI.
        </Link>
        <h1 className="display-font mt-8 text-4xl">Введите код</h1>
        <p className="mt-3 text-sm leading-6 text-[#756865]">
          Код отправлен на {params.phone}. Ответ одинаков для новых и
          существующих аккаунтов.
        </p>
        <OtpVerifyForm phone={params.phone} returnTo={params.returnTo ?? "/"} />
      </div>
    </main>
  );
}
