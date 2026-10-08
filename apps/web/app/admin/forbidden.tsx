import Link from "next/link";
export default function AdminForbidden() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#101722] px-6 text-center text-white">
      <div>
        <p className="text-xs font-bold tracking-[.2em] text-[#e0618f] uppercase">
          403 · Permission denied
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Недостаточно прав</h1>
        <p className="mt-3 text-slate-400">
          Эта зона требует отдельного административного permission.
        </p>
        <Link
          className="mt-7 inline-flex rounded-xl bg-white px-5 py-3 font-semibold text-[#101722]"
          href="/admin"
        >
          В Control Center
        </Link>
      </div>
    </main>
  );
}
