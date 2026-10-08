import { UserRoleCode, type UserStatus } from "@nozi/database";

export const Permission = {
  AdminAccess: "admin:access",
  AdminManage: "admin.manage",
  AuditRead: "audit.read",
  CategoriesManage: "categories.manage",
  CouriersManage: "couriers.manage",
  CustomersManage: "customers.manage",
  CustomersRead: "customers.read",
  FinanceRead: "finance.read",
  FinanceCommissionManage: "finance.commission.manage",
  FinanceCashManage: "finance.cash.manage",
  OrdersManage: "orders.manage",
  OrdersRead: "orders.read",
  ProductsModerate: "products.moderate",
  SellersManage: "sellers.manage",
  SellersRead: "sellers.read",
  StoresManage: "stores.manage",
  StoresRead: "stores.read",
  CourierAccess: "courier:access",
  CustomerAccess: "customer:access",
  SellerAccess: "seller:access",
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];

const rolePermissions = {
  [UserRoleCode.CUSTOMER]: [Permission.CustomerAccess],
  [UserRoleCode.SELLER]: [Permission.SellerAccess],
  [UserRoleCode.COURIER]: [Permission.CourierAccess],
  [UserRoleCode.ADMIN]: [Permission.AdminAccess],
  [UserRoleCode.SUPER_ADMIN]: Object.values(Permission),
} satisfies Record<UserRoleCode, readonly PermissionCode[]>;

export type ActorContext = {
  permissions: ReadonlySet<string>;
  roles: ReadonlySet<UserRoleCode>;
  status: UserStatus;
  userId: string;
};

export class AuthorizationError extends Error {
  readonly code: "AUTHENTICATION_REQUIRED" | "ACCOUNT_INACTIVE" | "FORBIDDEN";
  readonly status: 401 | 403;

  constructor(
    code: "AUTHENTICATION_REQUIRED" | "ACCOUNT_INACTIVE" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = code === "AUTHENTICATION_REQUIRED" ? 401 : 403;
  }
}

export function buildActorContext(input: {
  explicitPermissions?: readonly string[];
  roles: readonly UserRoleCode[];
  status: UserStatus;
  userId: string;
}): ActorContext {
  const permissions = new Set<string>(input.explicitPermissions ?? []);

  for (const role of input.roles) {
    for (const permission of rolePermissions[role]) {
      permissions.add(permission);
    }
  }

  return {
    permissions,
    roles: new Set(input.roles),
    status: input.status,
    userId: input.userId,
  };
}

export function assertActiveActor(actor: ActorContext): void {
  if (actor.status !== "ACTIVE") {
    throw new AuthorizationError(
      "ACCOUNT_INACTIVE",
      "The account is not active",
    );
  }
}

export function assertPermission(
  actor: ActorContext,
  permission: PermissionCode,
): void {
  assertActiveActor(actor);

  if (!actor.permissions.has(permission)) {
    throw new AuthorizationError(
      "FORBIDDEN",
      "The requested action is not permitted",
    );
  }
}

export function assertRole(
  actor: ActorContext,
  allowedRoles: readonly UserRoleCode[],
): void {
  assertActiveActor(actor);

  if (!allowedRoles.some((role) => actor.roles.has(role))) {
    throw new AuthorizationError("FORBIDDEN", "The requested role is required");
  }
}

export function assertOwnResource(
  actor: ActorContext,
  ownerUserId: string,
): void {
  assertActiveActor(actor);

  if (
    actor.userId !== ownerUserId &&
    !actor.roles.has(UserRoleCode.SUPER_ADMIN)
  ) {
    throw new AuthorizationError(
      "FORBIDDEN",
      "The requested resource is outside actor scope",
    );
  }
}
