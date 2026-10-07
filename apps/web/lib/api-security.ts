import { AuthorizationError } from "@nozi/auth";
import { getEnv } from "@nozi/config";

export function assertTrustedOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const trustedOrigin = new URL(getEnv().APP_URL).origin;
  if (!origin || origin !== trustedOrigin) {
    throw new AuthorizationError("FORBIDDEN", "Request origin is not trusted");
  }
}
