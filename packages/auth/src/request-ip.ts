import { createHash } from "node:crypto";

import { getEnv } from "@nozi/config";

export function getTrustedClientIp(headers: Headers): string | null {
  if (getEnv().TRUST_PROXY !== "cloudflare") return null;
  const value = headers.get("cf-connecting-ip")?.trim();
  if (!value || value.includes(",") || value.length > 64) return null;
  return value;
}

export function hashClientIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${getEnv().AUTH_SECRET}:ip:${ip}`)
    .digest("hex");
}
