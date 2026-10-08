import Link from "next/link";

export default function CourierForbidden() {
  return (
    <main className="mx-auto max-w-lg px-5 py-20 text-center">
      <h1 className="text-3xl font-black">Нет доступа к courier workspace</h1>
      <p className="mt-3 text-slate-600">
        Войдите под активной учётной записью курьера.
      </p>
      <Link
        className="mt-6 inline-flex rounded-xl bg-[#17624a] px-5 py-3 font-bold text-white"
        href="/sign-in?callbackUrl=/courier"
      >
        Войти
      </Link>
    </main>
  );
}
