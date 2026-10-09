"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NotificationActions({
  notificationId,
}: {
  notificationId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      className="text-xs font-semibold text-[#8f2d56] disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch(
          notificationId
            ? `/api/v1/notifications/${notificationId}`
            : "/api/v1/notifications/read-all",
          { method: notificationId ? "PATCH" : "POST" },
        );
        router.refresh();
        setPending(false);
      }}
      type="button"
    >
      {notificationId ? "Прочитано" : "Прочитать все"}
    </button>
  );
}
