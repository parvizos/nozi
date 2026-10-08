import { getEnv } from "@nozi/config";

import { MarketplaceError } from "./errors";
import {
  dushanbeDateTime,
  dushanbeLocalParts,
  MARKETPLACE_TIME_ZONE,
} from "./timezone";

type OpeningHour = {
  closesAt: string | null;
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string | null;
};

export type DeliverySlotStore = {
  defaultPreparationMinutes: number;
  isActive: boolean;
  isOpen: boolean;
  isTemporarilyPaused: boolean;
  openingHours: readonly OpeningHour[];
  timezone: string;
};

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

function plusDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function openingInterval(
  date: string,
  opening: OpeningHour,
): { end: Date; start: Date } | null {
  if (opening.isClosed || !opening.opensAt || !opening.closesAt) return null;
  const start = dushanbeDateTime(date, opening.opensAt);
  const crossesMidnight = minutes(opening.closesAt) <= minutes(opening.opensAt);
  const end = dushanbeDateTime(
    crossesMidnight ? plusDays(date, 1) : date,
    opening.closesAt,
  );
  return { end, start };
}

export function validateDeliverySlot(input: {
  date: string;
  now?: Date;
  preparationMinutes: number;
  store: DeliverySlotStore;
  windowEnd: string;
  windowStart: string;
}): { end: Date; start: Date } {
  const now = input.now ?? new Date();
  const env = getEnv();
  if (input.store.timezone !== MARKETPLACE_TIME_ZONE) {
    throw new MarketplaceError(
      "DELIVERY_SLOT_UNAVAILABLE",
      "Часовой пояс магазина пока не поддерживается",
      422,
    );
  }
  if (
    !input.store.isActive ||
    !input.store.isOpen ||
    input.store.isTemporarilyPaused
  ) {
    throw new MarketplaceError(
      "DELIVERY_SLOT_UNAVAILABLE",
      "Магазин сейчас не принимает заказы",
      422,
    );
  }

  const today = dushanbeLocalParts(now).date;
  const horizon = plusDays(today, env.MAX_DELIVERY_HORIZON_DAYS);
  if (input.date < today || input.date > horizon) {
    throw new MarketplaceError(
      "DELIVERY_SLOT_UNAVAILABLE",
      `Доставка доступна не более чем на ${env.MAX_DELIVERY_HORIZON_DAYS} дней вперёд`,
      422,
    );
  }

  const start = dushanbeDateTime(input.date, input.windowStart);
  const end = dushanbeDateTime(
    minutes(input.windowEnd) <= minutes(input.windowStart)
      ? plusDays(input.date, 1)
      : input.date,
    input.windowEnd,
  );
  const earliest = new Date(
    now.getTime() + Math.max(0, input.preparationMinutes) * 60_000,
  );
  if (start < earliest || end <= start) {
    throw new MarketplaceError(
      "DELIVERY_SLOT_UNAVAILABLE",
      "Выбранное окно уже прошло или недостижимо с учётом подготовки",
      422,
    );
  }

  const candidateDates = [plusDays(input.date, -1), input.date];
  const fitsOpeningHours = candidateDates.some((date) => {
    const opening = input.store.openingHours.find(
      ({ dayOfWeek }) => dayOfWeek === weekday(date),
    );
    const interval = opening ? openingInterval(date, opening) : null;
    return interval && start >= interval.start && end <= interval.end;
  });
  if (!fitsOpeningHours) {
    throw new MarketplaceError(
      "DELIVERY_SLOT_UNAVAILABLE",
      "Выбранное окно находится вне графика магазина",
      422,
    );
  }
  return { end, start };
}
