"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Variant = {
  absolutePrice: string | null;
  id?: string;
  isActive: boolean;
  name: string;
  priceDelta: string;
  sku: string | null;
  sortOrder: number;
  stockQuantity: number;
};
type Initial = {
  categoryId: string;
  compareAtPrice: string | null;
  description: string;
  id?: string;
  imageAlt: string;
  imageKey: string;
  name: string;
  preparationTimeMinutes: number | null;
  price: string;
  slug: string;
  status: "DRAFT" | "PENDING_REVIEW";
  stockQuantity: number;
  storeId: string;
  variants: Variant[];
  version?: number;
};
export function SellerProductForm({
  categories,
  initial,
  stores,
  moderation,
}: {
  categories: { id: string; name: string }[];
  initial: Initial;
  stores: { id: string; name: string }[];
  moderation?: {
    liveStatus: string;
    reason: string | null;
    revisionStatus: string | null;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof Initial>(key: K, value: Initial[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function updateVariant(index: number, patch: Partial<Variant>) {
    set(
      "variants",
      form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const requestedStatus =
      submitter?.value === "PENDING_REVIEW" ? "PENDING_REVIEW" : "DRAFT";
    setBusy(true);
    setError("");
    const body = {
      categoryId: form.categoryId,
      compareAtPrice: form.compareAtPrice ?? "",
      description: form.description,
      images: form.imageKey
        ? [
            {
              altText: form.imageAlt || form.name,
              isPrimary: true,
              objectKey: form.imageKey,
              sortOrder: 0,
            },
          ]
        : [],
      name: form.name,
      preparationTimeMinutes: form.preparationTimeMinutes,
      price: form.price,
      slug: form.slug,
      status: requestedStatus,
      stockQuantity: Number(form.stockQuantity),
      storeId: form.storeId,
      variants: form.variants.map((v, i) => ({
        ...v,
        absolutePrice: v.absolutePrice ?? "",
        sortOrder: i,
        stockQuantity: Number(v.stockQuantity),
      })),
      version: form.version,
    };
    const response = await fetch(
      form.id
        ? `/api/v1/seller/products/${form.id}`
        : "/api/v1/seller/products",
      {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      product?: { id: string };
    };
    setBusy(false);
    if (!response.ok) {
      setError(result.message ?? "Проверьте данные товара");
      return;
    }
    router.push("/seller/products");
    router.refresh();
  }
  return (
    <form
      className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_.7fr]"
      onSubmit={submit}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">Основное</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              Название
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                maxLength={200}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!form.id)
                    set(
                      "slug",
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, ""),
                    );
                }}
                required
                value={form.name}
              />
            </label>
            <label className="text-sm font-semibold">
              Slug
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("slug", e.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={form.slug}
              />
            </label>
            <label className="text-sm font-semibold">
              Категория
              <select
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("categoryId", e.target.value)}
                required
                value={form.categoryId}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Описание
              <textarea
                className="mt-2 min-h-36 w-full rounded-xl border p-3 font-normal"
                minLength={20}
                onChange={(e) => set("description", e.target.value)}
                required
                value={form.description}
              />
            </label>
          </div>
        </section>
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <div className="flex justify-between">
            <h2 className="text-xl font-semibold">Варианты</h2>
            <button
              className="text-sm font-semibold text-[#8f2d56]"
              onClick={() =>
                set("variants", [
                  ...form.variants,
                  {
                    absolutePrice: null,
                    isActive: true,
                    name: "",
                    priceDelta: "0.00",
                    sku: null,
                    sortOrder: form.variants.length,
                    stockQuantity: 0,
                  },
                ])
              }
              type="button"
            >
              + Добавить
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {form.variants.map((variant, index) => (
              <div
                className="grid gap-3 rounded-xl bg-[#f8f6f2] p-4 sm:grid-cols-4"
                key={variant.id ?? index}
              >
                <input
                  aria-label="Название варианта"
                  className="rounded-lg border p-2"
                  onChange={(e) =>
                    updateVariant(index, { name: e.target.value })
                  }
                  placeholder="Размер"
                  required
                  value={variant.name}
                />
                <input
                  aria-label="SKU"
                  className="rounded-lg border p-2"
                  onChange={(e) =>
                    updateVariant(index, { sku: e.target.value || null })
                  }
                  placeholder="SKU"
                  value={variant.sku ?? ""}
                />
                <input
                  aria-label="Доплата"
                  className="rounded-lg border p-2"
                  onChange={(e) =>
                    updateVariant(index, { priceDelta: e.target.value })
                  }
                  placeholder="Доплата"
                  value={variant.priceDelta}
                />
                <div className="flex gap-2">
                  <input
                    aria-label="Остаток варианта"
                    className="min-w-0 flex-1 rounded-lg border p-2"
                    min={0}
                    onChange={(e) =>
                      updateVariant(index, {
                        stockQuantity: Number(e.target.value),
                      })
                    }
                    type="number"
                    value={variant.stockQuantity}
                  />
                  <button
                    aria-label="Удалить вариант"
                    className="px-2 text-red-700"
                    onClick={() =>
                      set(
                        "variants",
                        form.variants.filter((_, i) => i !== index),
                      )
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <aside className="space-y-6">
        {moderation ? (
          <section className="rounded-2xl border border-[#ded9d2] bg-white p-5 text-sm">
            <p className="font-semibold">Публикация: {moderation.liveStatus}</p>
            {moderation.revisionStatus ? (
              <p className="mt-1 text-[#756e69]">
                Изменения: {moderation.revisionStatus}
              </p>
            ) : null}
            {moderation.reason ? (
              <p className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-800">
                Причина отклонения: {moderation.reason}
              </p>
            ) : null}
          </section>
        ) : null}
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">Продажа</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-semibold">
              Магазин
              <select
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("storeId", e.target.value)}
                value={form.storeId}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Цена, TJS
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("price", e.target.value)}
                required
                value={form.price}
              />
            </label>
            <label className="block text-sm font-semibold">
              Цена до скидки
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                onChange={(e) => set("compareAtPrice", e.target.value || null)}
                value={form.compareAtPrice ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold">
              Физический остаток
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                min={0}
                onChange={(e) => set("stockQuantity", Number(e.target.value))}
                type="number"
                value={form.stockQuantity}
              />
            </label>
            <label className="block text-sm font-semibold">
              Подготовка, минут
              <input
                className="mt-2 w-full rounded-xl border p-3 font-normal"
                min={5}
                onChange={(e) =>
                  set("preparationTimeMinutes", Number(e.target.value))
                }
                type="number"
                value={form.preparationTimeMinutes ?? 60}
              />
            </label>
          </div>
        </section>
        <section className="rounded-2xl border border-[#ded9d2] bg-white p-6">
          <h2 className="text-xl font-semibold">Изображение</h2>
          <p className="mt-1 text-xs text-[#756e69]">
            В development используется metadata-only storage adapter.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Object key / URL
            <input
              className="mt-2 w-full rounded-xl border p-3 font-normal"
              onChange={(e) => set("imageKey", e.target.value)}
              placeholder="/images/products/gifts.svg"
              value={form.imageKey}
            />
          </label>
          <label className="mt-4 block text-sm font-semibold">
            Alt text
            <input
              className="mt-2 w-full rounded-xl border p-3 font-normal"
              onChange={(e) => set("imageAlt", e.target.value)}
              value={form.imageAlt}
            />
          </label>
        </section>
        {error ? (
          <p
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="grid gap-2">
          <button
            className="w-full rounded-xl border border-[#8f2d56] bg-white px-5 py-3.5 font-semibold text-[#8f2d56] disabled:opacity-50"
            disabled={busy}
            type="submit"
            value="DRAFT"
          >
            {busy ? "Сохраняем…" : "Сохранить черновик"}
          </button>
          <button
            className="w-full rounded-xl bg-[#8f2d56] px-5 py-3.5 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            type="submit"
            value="PENDING_REVIEW"
          >
            {busy ? "Отправляем…" : "Отправить на проверку"}
          </button>
        </div>
      </aside>
    </form>
  );
}
