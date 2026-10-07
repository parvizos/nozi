"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CartView } from "@nozi/marketplace";

import { formatMoney } from "./product-card";

export function CartClient({ initialCart }: { initialCart: CartView | null }) {
  const router = useRouter();
  const [cart, setCart] = useState(initialCart);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(
    itemId: string,
    method: "DELETE" | "PATCH",
    quantity?: number,
  ): Promise<void> {
    setPendingItem(itemId);
    setError(null);
    try {
      const response = await fetch(`/api/v1/cart/items/${itemId}`, {
        ...(quantity
          ? {
              body: JSON.stringify({ quantity }),
              headers: { "content-type": "application/json" },
            }
          : {}),
        method,
      });
      const body = (await response.json()) as {
        cart?: CartView | null;
        message?: string;
      };
      if (!response.ok)
        throw new Error(body.message ?? "Не удалось обновить корзину");
      setCart(body.cart ?? null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Попробуйте ещё раз");
    } finally {
      setPendingItem(null);
    }
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-[#d9c8c1] bg-white px-6 py-20 text-center">
        <p className="display-font text-3xl">Корзина пока пуста</p>
        <p className="mt-3 text-sm text-[#756865]">
          Найдите подарок, который хочется отправить близкому человеку.
        </p>
        <Link
          className="mt-6 inline-flex rounded-full bg-[#2c2523] px-6 py-3 text-sm font-semibold text-white"
          href="/catalog"
        >
          Открыть каталог
        </Link>
      </div>
    );
  }

  const minimumReached =
    Number(cart.subtotal) >= Number(cart.minimumOrderAmount);
  const allAvailable = cart.items.every(({ available }) => available);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4" aria-label="Товары в корзине">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-[#756865]">Магазин</p>
            <Link className="font-semibold" href={`/store/${cart.store.slug}`}>
              {cart.store.name}
            </Link>
          </div>
          <span className="text-sm text-[#756865]">{cart.count} шт.</span>
        </div>
        {cart.items.map((item) => (
          <article
            className="flex gap-4 rounded-3xl border border-[#eadfda] bg-white p-3 sm:p-4"
            key={item.id}
          >
            <Link
              className="relative h-28 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#eee5e0] sm:h-32 sm:w-28"
              href={`/product/${item.productSlug}`}
            >
              {item.image ? (
                <Image
                  alt={item.image.alt}
                  className="object-cover"
                  fill
                  sizes="112px"
                  src={item.image.src}
                />
              ) : null}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    className="font-semibold"
                    href={`/product/${item.productSlug}`}
                  >
                    {item.productName}
                  </Link>
                  {item.variantName ? (
                    <p className="mt-1 text-xs text-[#756865]">
                      {item.variantName}
                    </p>
                  ) : null}
                </div>
                <button
                  aria-label={`Удалить ${item.productName}`}
                  className="text-xs text-[#8f2d56] underline"
                  disabled={pendingItem === item.id}
                  onClick={() => mutate(item.id, "DELETE")}
                  type="button"
                >
                  Удалить
                </button>
              </div>
              {!item.available ? (
                <p className="mt-2 text-xs font-medium text-red-700">
                  Количество или товар больше недоступны
                </p>
              ) : null}
              <div className="mt-5 flex items-end justify-between">
                <div className="flex items-center rounded-full border border-[#ded2cd]">
                  <button
                    aria-label="Уменьшить количество"
                    className="h-9 w-9"
                    disabled={pendingItem === item.id || item.quantity <= 1}
                    onClick={() => mutate(item.id, "PATCH", item.quantity - 1)}
                    type="button"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm">
                    {pendingItem === item.id ? "…" : item.quantity}
                  </span>
                  <button
                    aria-label="Увеличить количество"
                    className="h-9 w-9"
                    disabled={pendingItem === item.id}
                    onClick={() => mutate(item.id, "PATCH", item.quantity + 1)}
                    type="button"
                  >
                    +
                  </button>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatMoney(item.lineTotal, cart.currencyCode)}
                  </p>
                  <p className="text-xs text-[#8b7d78]">
                    {formatMoney(item.unitPrice, cart.currencyCode)} / шт.
                  </p>
                </div>
              </div>
            </div>
          </article>
        ))}
        {error ? (
          <p
            className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>
      <aside>
        <div className="sticky top-28 rounded-[1.7rem] border border-[#e4d7d2] bg-white p-6 shadow-xl shadow-[#6c3a4a]/5">
          <h2 className="display-font text-2xl">Ваш заказ</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#756865]">Товары</dt>
              <dd>{formatMoney(cart.subtotal, cart.currencyCode)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#756865]">Доставка</dt>
              <dd>{formatMoney(cart.deliveryFee, cart.currencyCode)}</dd>
            </div>
            <div className="flex justify-between border-t border-[#eadfda] pt-4 text-base font-semibold">
              <dt>Итого</dt>
              <dd>{formatMoney(cart.totalPreview, cart.currencyCode)}</dd>
            </div>
          </dl>
          {!minimumReached ? (
            <p className="mt-4 rounded-xl bg-[#fff7ed] p-3 text-xs text-[#7a4b20]">
              Минимальная сумма магазина —{" "}
              {formatMoney(cart.minimumOrderAmount, cart.currencyCode)}
            </p>
          ) : null}
          <Link
            aria-disabled={!minimumReached || !allAvailable}
            className={`mt-6 flex w-full justify-center rounded-full px-5 py-3.5 text-sm font-semibold ${minimumReached && allAvailable ? "bg-[#2c2523] text-white hover:bg-[#8f2d56]" : "pointer-events-none bg-[#ddd5d1] text-[#837772]"}`}
            href="/checkout"
          >
            Перейти к оформлению
          </Link>
          <p className="mt-3 text-center text-xs text-[#887a75]">
            Цены и наличие будут проверены ещё раз
          </p>
        </div>
      </aside>
    </div>
  );
}
