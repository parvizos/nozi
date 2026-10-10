export { auth } from "./server";
export { hashPassword, verifyPassword } from "./password";
export {
  assertActiveActor,
  assertOwnResource,
  assertPermission,
  assertRole,
  AuthorizationError,
  buildActorContext,
  Permission,
} from "./rbac";
export type { ActorContext, PermissionCode } from "./rbac";
export { getActorContext, requireActorContext } from "./session";
export {
  listAdminUsers,
  setAdminUserStatus,
  setUserStatus,
} from "./user-status";
export { IdentityError } from "./identity-error";
export { formatTajikPhone, isTajikPhone, normalizeTajikPhone } from "./phone";
export { getTrustedClientIp, hashClientIp } from "./request-ip";
export {
  decryptTransientSecret,
  encryptTransientSecret,
  onPhoneVerified,
  requestPhoneOtp,
  verifyAndConsumePhoneOtp,
} from "./otp";
export { verifyTurnstile } from "./turnstile";
