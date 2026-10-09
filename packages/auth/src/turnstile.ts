import { getEnv } from "@nozi/config";

import { IdentityError } from "./identity-error";

export async function verifyTurnstile(input: {
  clientIp: string | null;
  token?: string;
}): Promise<void> {
  const env = getEnv();
  if (env.TURNSTILE_MODE === "disabled") return;
  if (!input.token) {
    if (env.TURNSTILE_MODE === "required")
      throw new IdentityError(
        "BOT_CHALLENGE_REQUIRED",
        "Подтвердите, что вы не робот",
        403,
      );
    return;
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.TURNSTILE_MODE === "required")
      throw new Error("Turnstile is required but not configured");
    return;
  }
  const body = new URLSearchParams({
    response: input.token,
    secret: env.TURNSTILE_SECRET_KEY,
  });
  if (input.clientIp) body.set("remoteip", input.clientIp);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { body, method: "POST", signal: AbortSignal.timeout(5_000) },
  );
  const result = (await response.json()) as { success?: boolean };
  if (!response.ok || result.success !== true)
    throw new IdentityError(
      "BOT_CHALLENGE_FAILED",
      "Проверка безопасности не пройдена",
      403,
    );
}
