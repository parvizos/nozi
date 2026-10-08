import type { Metadata } from "next";

import { CourierActivationForm } from "../../../../components/courier-activation-form";

export const metadata: Metadata = {
  description: "Secure courier account activation for NOZI",
  title: "Активация курьера — NOZI",
};

export default async function CourierActivationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-5 py-12">
      <section className="w-full rounded-3xl border bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold tracking-widest text-rose-600">
          NOZI COURIER
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Создайте пароль</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600">
          Ссылка одноразовая и действует ограниченное время.
        </p>
        <CourierActivationForm token={token} />
      </section>
    </main>
  );
}
