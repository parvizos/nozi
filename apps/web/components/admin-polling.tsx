"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export function AdminPolling({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="text-xs text-slate-500">
      Обновление каждые {seconds} сек.
    </span>
  );
}
