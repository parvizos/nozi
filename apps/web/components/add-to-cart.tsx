"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMoney } from "./product-card";

type Variant = {
  absolutePrice: string | null;
  id: string;
  name: string;
  priceDelta: string;
  stockQuantity: number;
};

export function AddToCart({
  currencyCode,
  productId,
  productPrice,
  returnTo,
  signedIn,
  variants,
}: {
  currencyCode: string;
  productId: string;
  productPrice: string;
  returnTo: string;
  signedIn: boolean;
  variants: Variant[];
}) {
  const router = useRouter();
  const [selectedVariantId, setSelectedVariantId] = useState(
    variants[0]?.id ?? null,
  );
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(clearExisting = false): Promise<void> {
    if (!signedIn) {
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
      return;
    }
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      if (clearExisting) {
        const clearResponse = await fetch("/api/v1/cart", { method: "DELETE" });
        if (!clearResponse.ok) throw new Error("Не удалось очистить корзину");
      }
      const response = await fetch("/api/v1/cart/items", {
        body: JSON.stringify({
          productId,
          productVariantId: selectedVariantId,
          quantity: 1,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        code?: string;
        message?: string;
      };
      if (response.status === 401) {
        router.push(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (body.code === "CART_STORE_CONFLICT") {
        setConflict(true);
        return;
      }
      if (!response.ok)
        throw new Error(body.message ?? "Не удалось добавить товар");
      setAdded(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Попробуйте ещё раз");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-7">
      {variants.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-semibold">Размер / вариант</legend>
          <div className="mt-3 grid gap-2">
            {variants.map((variant) => (
              <label
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-[#dfd2cd] bg-white px-4 py-3 has-checked:border-[#8f2d56] has-checked:ring-1 has-checked:ring-[#8f2d56]"
                key={variant.id}
              >
                <span className="flex items-center gap-3">
                  <input
                    checked={selectedVariantId === variant.id}
                    disabled={variant.stockQuantity === 0}
                    name="variant"
                    onChange={() => setSelectedVariantId(variant.id)}
                    type="radio"
                    value={variant.id}
                  />
                  <span className="text-sm font-medium">{variant.name}</span>
                </span>
                <span className="text-sm">
                  {variant.stockQuantity === 0
                    ? "Нет в наличии"
                    : variant.absolutePrice
                      ? formatMoney(variant.absolutePrice, currencyCode)
                      : Number(variant.priceDelta) > 0
                        ? `+ ${formatMoney(variant.priceDelta, currencyCode)}`
                        : formatMoney(productPrice, currencyCode)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-6">
        {added ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-full bg-[#e4f1e7] px-5 py-3.5 text-center text-sm font-semibold text-[#356344]">
              Добавлено в корзину
            </div>
            <Link
              className="rounded-full bg-[#2c2523] px-5 py-3.5 text-sm font-semibold text-white"
              href="/cart"
            >
              Перейти
            </Link>
          </div>
        ) : (
          <button
            className="w-full rounded-full bg-[#2c2523] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#8f2d56] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || (variants.length > 0 && !selectedVariantId)}
            onClick={() => add()}
            type="button"
          >
            {pending ? "Добавляем…" : "Добавить в корзину"}
          </button>
        )}
      </div>
      {conflict ? (
        <div className="mt-3 rounded-2xl border border-[#e5c9b0] bg-[#fff7ed] p-4 text-sm">
          <p>В корзине уже есть товары другого магазина.</p>
          <button
            className="mt-3 font-semibold text-[#8f2d56] underline"
            disabled={pending}
            onClick={() => add(true)}
            type="button"
          >
            Очистить корзину и добавить этот товар
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
