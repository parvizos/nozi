"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      className="rounded-full border border-[#dfd2cd] px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      type="button"
    >
      {pending ? "Выходим…" : "Выйти"}
    </button>
  );
}
