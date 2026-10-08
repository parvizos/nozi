export type MarketplaceErrorCode =
  | "ADMIN_RESOURCE_NOT_FOUND"
  | "ADMIN_RATE_LIMITED"
  | "CART_EMPTY"
  | "CART_ITEM_NOT_FOUND"
  | "CART_STORE_CONFLICT"
  | "CHECKOUT_RATE_LIMITED"
  | "COURIER_ASSIGNMENT_CONFLICT"
  | "COURIER_DELIVERY_NOT_FOUND"
  | "COURIER_ACTION_CONFLICT"
  | "COURIER_ACTIVATION_BLOCKED"
  | "COURIER_ACTIVATION_RATE_LIMITED"
  | "COURIER_INVITATION_EXPIRED"
  | "COURIER_INVITATION_INVALID"
  | "COURIER_INVITATION_USED"
  | "COURIER_RATE_LIMITED"
  | "COURIER_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "FAILED_DELIVERY_CONFLICT"
  | "CASH_SETTLEMENT_CONFLICT"
  | "DELIVERY_CODE_EXPIRED"
  | "DELIVERY_CODE_INVALID"
  | "DELIVERY_CODE_LOCKED"
  | "DELIVERY_PROOF_REQUIRED"
  | "DELIVERY_SLOT_UNAVAILABLE"
  | "FORBIDDEN"
  | "INVENTORY_RESERVATION_CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "INVALID_ORDER_TRANSITION"
  | "PRODUCT_SLUG_CONFLICT"
  | "PRODUCT_MODERATION_CONFLICT"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "PENDING_CASH_ORDER_LIMIT"
  | "ORDER_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "STORE_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "VARIANT_REQUIRED"
  | "VARIANT_UNAVAILABLE"
  | "VERSION_CONFLICT";

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly details: Record<string, string> | undefined;
  readonly status: 400 | 403 | 404 | 409 | 410 | 422 | 429;

  constructor(
    code: MarketplaceErrorCode,
    message: string,
    status: 400 | 403 | 404 | 409 | 410 | 422 | 429,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "MarketplaceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
