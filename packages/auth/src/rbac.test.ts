import { describe, expect, it } from "vitest";

import { UserRoleCode, UserStatus } from "@nozi/database";

import {
  assertOwnResource,
  assertPermission,
  assertRole,
  AuthorizationError,
  buildActorContext,
  Permission,
} from "./rbac";

describe("RBAC policy", () => {
  it("grants the permissions associated with all assigned roles", () => {
    const actor = buildActorContext({
      roles: [UserRoleCode.CUSTOMER, UserRoleCode.SELLER],
      status: UserStatus.ACTIVE,
      userId: "user-1",
    });

    expect(() =>
      assertPermission(actor, Permission.CustomerAccess),
    ).not.toThrow();
    expect(() =>
      assertPermission(actor, Permission.SellerAccess),
    ).not.toThrow();
    expect(() => assertPermission(actor, Permission.AdminAccess)).toThrow(
      AuthorizationError,
    );
  });

  it("denies every action for a suspended actor", () => {
    const actor = buildActorContext({
      roles: [UserRoleCode.SUPER_ADMIN],
      status: UserStatus.SUSPENDED,
      userId: "user-1",
    });

    expect(() => assertPermission(actor, Permission.AdminAccess)).toThrow(
      "not active",
    );
    expect(() => assertRole(actor, [UserRoleCode.SUPER_ADMIN])).toThrow(
      "not active",
    );
  });

  it("prevents access to a different user's resource", () => {
    const customer = buildActorContext({
      roles: [UserRoleCode.CUSTOMER],
      status: UserStatus.ACTIVE,
      userId: "customer-1",
    });

    expect(() => assertOwnResource(customer, "customer-1")).not.toThrow();
    expect(() => assertOwnResource(customer, "customer-2")).toThrow(
      AuthorizationError,
    );
  });
});
