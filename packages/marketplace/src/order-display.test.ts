import { describe, expect, it } from "vitest";

import { CourierAssignmentStatus, OrderStatus } from "@nozi/database";

import {
  courierAssignmentStatusLabels,
  formatDeliveryWindowTime,
  formatMarketplaceDateTime,
  marketplaceDateInputValue,
  orderStatusMetadata,
} from "./order-display";

describe("shared order presentation", () => {
  it("defines metadata for every order status", () => {
    expect(Object.keys(orderStatusMetadata).sort()).toEqual(
      Object.values(OrderStatus).sort(),
    );
    expect(
      Object.values(orderStatusMetadata).every(
        ({ label, shortLabel }) => label.length > 0 && shortLabel.length > 0,
      ),
    ).toBe(true);
  });

  it("defines a courier-facing label for every assignment status", () => {
    expect(Object.keys(courierAssignmentStatusLabels).sort()).toEqual(
      Object.values(CourierAssignmentStatus).sort(),
    );
  });

  it("formats timestamps in Asia/Dushanbe across UTC midnight", () => {
    expect(
      formatMarketplaceDateTime("2026-10-08T20:30:00.000Z", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    ).toContain("09.10.2026");
    expect(
      marketplaceDateInputValue(new Date("2026-10-08T20:30:00.000Z")),
    ).toBe("2026-10-09");
    expect(formatDeliveryWindowTime("1970-01-01T23:30:00.000Z")).toContain(
      "23:30",
    );
  });
});
