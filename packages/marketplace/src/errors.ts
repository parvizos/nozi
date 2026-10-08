export type MarketplaceErrorCode =
  | "ADMIN_RESOURCE_NOT_FOUND"
  | "CART_EMPTY"
  | "CART_ITEM_NOT_FOUND"
  | "CART_STORE_CONFLICT"
  | "CHECKOUT_RATE_LIMITED"
  | "COURIER_ASSIGNMENT_CONFLICT"
  | "COURIER_DELIVERY_NOT_FOUND"
  | "COURIER_ACTION_CONFLICT"
  | "COURIER_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "INVALID_ORDER_TRANSITION"
  | "PRODUCT_SLUG_CONFLICT"
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
  readonly status: 400 | 404 | 409 | 422 | 429;

  constructor(
    code: MarketplaceErrorCode,
    message: string,
    status: 400 | 404 | 409 | 422 | 429,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "MarketplaceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
