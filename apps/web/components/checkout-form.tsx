"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import type { CartView } from "@nozi/marketplace";

import { formatMoney } from "./product-card";

const inputClass =
  "mt-2 w-full rounded-2xl border border-[#dfd2cd] bg-white px-4 py-3 text-sm outline-none focus:border-[#a95676] focus:ring-3 focus:ring-[#eed5de]";

export function CheckoutForm({
  cart,
  defaultName,
  defaultPhone,
  enableTestPayments,
  minimumDate,
}: {
  cart: CartView;
  defaultName: string;
  defaultPhone: string;
  enableTestPayments: boolean;
  minimumDate: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    idempotencyKey.current ??= crypto.randomUUID();
    const payload = {
      anonymousDelivery: form.get("anonymousDelivery") === "on",
      apartment: form.get("apartment"),
      buyerName: form.get("buyerName"),
      buyerPhone: form.get("buyerPhone"),
      customerNote: form.get("customerNote"),
      deliveryAddress: form.get("deliveryAddress"),
      deliveryDate: form.get("deliveryDate"),
      deliveryNote: form.get("deliveryNote"),
      deliveryWindowEnd: form.get("deliveryWindowEnd"),
      deliveryWindowStart: form.get("deliveryWindowStart"),
      entrance: form.get("entrance"),
      floor: form.get("floor"),
      giftMessage: form.get("giftMessage"),
      paymentMethod: form.get("paymentMethod"),
      recipientName: form.get("recipientName"),
      recipientPhone: form.get("recipientPhone"),
    };
    try {
      const response = await fetch("/api/v1/checkout/orders", {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        method: "POST",
      });
      const body = (await response.json()) as {
        message?: string;
        order?: { orderNumber: string };
      };
      if (!response.ok || !body.order)
        throw new Error(body.message ?? "Не удалось оформить заказ");
      router.push(`/order/${body.order.orderNumber}/success`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Попробуйте ещё раз");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-8 lg:grid-cols-[1fr_360px]" onSubmit={submit}>
      <div className="space-y-6">
        <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
          <h2 className="display-font text-2xl">Покупатель</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Ваше имя
              <input
                className={inputClass}
                defaultValue={defaultName}
                maxLength={160}
                name="buyerName"
                required
              />
            </label>
            <label className="text-sm font-medium">
              Телефон
              <input
                className={inputClass}
                defaultValue={defaultPhone}
                name="buyerPhone"
                pattern="\+[1-9][0-9]{7,14}"
                placeholder="+992900001234"
                required
                type="tel"
              />
            </label>
          </div>
        </section>
        <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
          <h2 className="display-font text-2xl">Получатель</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Имя получателя
              <input
                className={inputClass}
                maxLength={160}
                name="recipientName"
                required
              />
            </label>
            <label className="text-sm font-medium">
              Телефон получателя
              <input
                className={inputClass}
                name="recipientPhone"
                pattern="\+[1-9][0-9]{7,14}"
                placeholder="+992900001234"
                required
                type="tel"
              />
            </label>
          </div>
        </section>
        <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
          <h2 className="display-font text-2xl">Доставка</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium sm:col-span-3">
              Адрес
              <input
                className={inputClass}
                maxLength={240}
                name="deliveryAddress"
                placeholder="улица, дом"
                required
              />
            </label>
            <label className="text-sm font-medium">
              Квартира
              <input className={inputClass} maxLength={40} name="apartment" />
            </label>
            <label className="text-sm font-medium">
              Подъезд
              <input className={inputClass} maxLength={40} name="entrance" />
            </label>
            <label className="text-sm font-medium">
              Этаж
              <input className={inputClass} maxLength={20} name="floor" />
            </label>
            <label className="text-sm font-medium">
              Дата
              <input
                className={inputClass}
                defaultValue={minimumDate}
                min={minimumDate}
                name="deliveryDate"
                required
                type="date"
              />
            </label>
            <label className="text-sm font-medium">
              С
              <input
                className={inputClass}
                defaultValue="10:00"
                name="deliveryWindowStart"
                required
                type="time"
              />
            </label>
            <label className="text-sm font-medium">
              До
              <input
                className={inputClass}
                defaultValue="12:00"
                name="deliveryWindowEnd"
                required
                type="time"
              />
            </label>
            <label className="text-sm font-medium sm:col-span-3">
              Комментарий курьеру
              <textarea
                className={inputClass}
                maxLength={500}
                name="deliveryNote"
                rows={3}
              />
            </label>
          </div>
        </section>
        <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
          <h2 className="display-font text-2xl">Подарок</h2>
          <label className="mt-5 block text-sm font-medium">
            Текст открытки
            <textarea
              className={inputClass}
              maxLength={500}
              name="giftMessage"
              rows={3}
            />
          </label>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              className="h-4 w-4"
              name="anonymousDelivery"
              type="checkbox"
            />{" "}
            Не сообщать получателю имя отправителя
          </label>
          <label className="mt-4 block text-sm font-medium">
            Комментарий к заказу
            <textarea
              className={inputClass}
              maxLength={500}
              name="customerNote"
              rows={2}
            />
          </label>
        </section>
        <section className="rounded-[1.7rem] border border-[#e4d7d2] bg-white p-5 sm:p-7">
          <h2 className="display-font text-2xl">Оплата</h2>
          <div className="mt-5 grid gap-3">
            <label className="flex items-center gap-3 rounded-2xl border border-[#dfd2cd] p-4 has-checked:border-[#8f2d56]">
              <input
                defaultChecked
                name="paymentMethod"
                type="radio"
                value="CASH"
              />
              <span>
                <strong className="block text-sm">Наличными</strong>
                <span className="text-xs text-[#756865]">
                  Оплата при получении
                </span>
              </span>
            </label>
            {enableTestPayments ? (
              <label className="flex items-center gap-3 rounded-2xl border border-[#dfd2cd] p-4 has-checked:border-[#8f2d56]">
                <input name="paymentMethod" type="radio" value="TEST" />
                <span>
                  <strong className="block text-sm">Тестовая оплата</strong>
                  <span className="text-xs text-[#756865]">
                    Development provider без банковской карты
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </section>
      </div>
      <aside>
        <div className="sticky top-28 rounded-[1.7rem] border border-[#e4d7d2] bg-white p-6">
          <p className="text-sm text-[#756865]">{cart.store.name}</p>
          <h2 className="display-font mt-1 text-2xl">Итого</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt>Товары</dt>
              <dd>{formatMoney(cart.subtotal, cart.currencyCode)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Доставка</dt>
              <dd>{formatMoney(cart.deliveryFee, cart.currencyCode)}</dd>
            </div>
            <div className="flex justify-between border-t border-[#eadfda] pt-4 text-lg font-semibold">
              <dt>К оплате</dt>
              <dd>{formatMoney(cart.totalPreview, cart.currencyCode)}</dd>
            </div>
          </dl>
          {error ? (
            <p
              className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="mt-6 w-full rounded-full bg-[#2c2523] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Создаём заказ…" : "Оформить заказ"}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-[#887a75]">
            Нажимая кнопку, вы подтверждаете данные получателя и доставки
          </p>
        </div>
      </aside>
    </form>
  );
}
