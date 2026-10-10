import { describe, expect, it } from "vitest";

import { validateDeliverySlot } from "./delivery-slots";

const hours = Array.from({ length: 7 }, (_, index) => ({
  closesAt: "22:00",
  dayOfWeek: index + 1,
  isClosed: false,
  opensAt: "09:00",
}));
const store = {
  defaultPreparationMinutes: 60,
  isActive: true,
  isOpen: true,
  isTemporarilyPaused: false,
  openingHours: hours,
  timezone: "Asia/Dushanbe",
};

describe("DeliverySlotService", () => {
  const now = new Date("2026-10-08T05:00:00.000Z"); // 10:00 in Dushanbe

  it("accepts reachable same-day and tomorrow windows", () => {
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-08",
        now,
        preparationMinutes: 60,
        store,
        windowStart: "12:00",
        windowEnd: "14:00",
      }),
    ).not.toThrow();
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-09",
        now,
        preparationMinutes: 60,
        store,
        windowStart: "10:00",
        windowEnd: "12:00",
      }),
    ).not.toThrow();
  });

  it("rejects too-soon, past, closed and beyond-horizon slots", () => {
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-08",
        now,
        preparationMinutes: 90,
        store,
        windowStart: "10:30",
        windowEnd: "11:30",
      }),
    ).toThrow();
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-07",
        now,
        preparationMinutes: 0,
        store,
        windowStart: "12:00",
        windowEnd: "13:00",
      }),
    ).toThrow();
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-08",
        now,
        preparationMinutes: 0,
        store: { ...store, isOpen: false },
        windowStart: "12:00",
        windowEnd: "13:00",
      }),
    ).toThrow();
    expect(() =>
      validateDeliverySlot({
        date: "2026-11-08",
        now,
        preparationMinutes: 0,
        store,
        windowStart: "12:00",
        windowEnd: "13:00",
      }),
    ).toThrow();
  });

  it("rejects cross-midnight and zero-length delivery windows", () => {
    const overnight = {
      ...store,
      openingHours: hours.map((hour) => ({
        ...hour,
        closesAt: "02:00",
        opensAt: "18:00",
      })),
    };
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-08",
        now,
        preparationMinutes: 0,
        store: overnight,
        windowStart: "23:30",
        windowEnd: "01:00",
      }),
    ).toThrowError(/тот же день/);
    expect(() =>
      validateDeliverySlot({
        date: "2026-10-08",
        now,
        preparationMinutes: 0,
        store: overnight,
        windowStart: "10:00",
        windowEnd: "10:00",
      }),
    ).toThrowError(/тот же день/);
  });
});
