import type { CourierAssignmentStatus, OrderStatus } from "@nozi/database";

export type OrderStatusMetadata = {
  label: string;
  shortLabel: string;
  tone: "neutral" | "attention" | "progress" | "success" | "danger";
};

export const orderStatusMetadata = {
  CREATED: { label: "Заказ создан", shortLabel: "Создан", tone: "neutral" },
  AWAITING_SELLER_CONFIRMATION: {
    label: "Ожидает подтверждения магазина",
    shortLabel: "Ожидает магазин",
    tone: "attention",
  },
  CONFIRMED: {
    label: "Заказ подтверждён",
    shortLabel: "Подтверждён",
    tone: "progress",
  },
  PREPARING: {
    label: "Магазин готовит заказ",
    shortLabel: "Готовится",
    tone: "progress",
  },
  READY_FOR_PICKUP: {
    label: "Готов к передаче курьеру",
    shortLabel: "Готов",
    tone: "progress",
  },
  COURIER_ASSIGNED: {
    label: "Курьер назначен",
    shortLabel: "Курьер назначен",
    tone: "progress",
  },
  PICKED_UP: {
    label: "Курьер забрал заказ",
    shortLabel: "Забран",
    tone: "progress",
  },
  ON_THE_WAY: {
    label: "Курьер в пути",
    shortLabel: "В пути",
    tone: "progress",
  },
  DELIVERY_FAILED: {
    label: "Доставка не удалась — требуется решение оператора",
    shortLabel: "Проблема доставки",
    tone: "danger",
  },
  RESCHEDULED: {
    label: "Доставка перенесена",
    shortLabel: "Перенесён",
    tone: "attention",
  },
  RETURNING_TO_STORE: {
    label: "Заказ возвращается в магазин",
    shortLabel: "Возврат",
    tone: "attention",
  },
  RETURNED_TO_STORE: {
    label: "Заказ возвращён в магазин",
    shortLabel: "Возвращён",
    tone: "attention",
  },
  DELIVERED: {
    label: "Заказ доставлен",
    shortLabel: "Доставлен",
    tone: "success",
  },
  CANCELLED: { label: "Заказ отменён", shortLabel: "Отменён", tone: "danger" },
  REFUNDED: {
    label: "Возврат средств выполнен",
    shortLabel: "Возврат средств",
    tone: "neutral",
  },
} satisfies Record<OrderStatus, OrderStatusMetadata>;

export const courierAssignmentStatusLabels = {
  ACCEPTED: "Задание принято",
  ARRIVED_AT_STORE: "Курьер в магазине",
  ASSIGNED: "Новое назначение",
  CANCELLED: "Назначение отменено",
  DELIVERED: "Доставлено",
  DELIVERY_FAILED: "Проблема доставки",
  ON_THE_WAY: "В пути к получателю",
  PICKED_UP: "Заказ у курьера",
  RETURNED_TO_STORE: "Возвращено в магазин",
  RETURNING_TO_STORE: "Возврат в магазин",
} satisfies Record<CourierAssignmentStatus, string>;

export const MARKETPLACE_TIME_ZONE = "Asia/Dushanbe";

export function formatMarketplaceDateTime(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat("ru-TJ", {
    ...options,
    timeZone: MARKETPLACE_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatMarketplaceDate(value: Date | string): string {
  return formatMarketplaceDateTime(value, { dateStyle: "medium" });
}

export function marketplaceDateInputValue(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: MARKETPLACE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(value);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${byType.year}-${byType.month}-${byType.day}`;
}

// PostgreSQL TIME values are represented by Prisma as 1970 UTC dates. They
// already contain the store-local wall clock, so applying UTC+5 again would
// corrupt the delivery window.
export function formatDeliveryWindowTime(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-TJ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(typeof value === "string" ? new Date(value) : value);
}
