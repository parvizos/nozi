"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeartIcon } from "./icons";

export function FavoriteButton({
  initialFavorite,
  productId,
  returnTo,
  signedIn,
}: {
  initialFavorite: boolean;
  productId: string;
  returnTo: string;
  signedIn: boolean;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    if (!signedIn) {
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/favorites/${productId}`, {
        method: favorite ? "DELETE" : "POST",
      });
      if (response.status === 401) {
        router.push(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (!response.ok) throw new Error("Не удалось обновить избранное");
      setFavorite(!favorite);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Попробуйте ещё раз");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}
        aria-pressed={favorite}
        className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${favorite ? "border-[#8f2d56] bg-[#f8e8ee] text-[#8f2d56]" : "border-[#dfd2cd] bg-white text-[#5d4e49] hover:border-[#8f2d56]"}`}
        disabled={pending}
        onClick={toggle}
        type="button"
      >
        <HeartIcon className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} />
      </button>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
