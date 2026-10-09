import {
  getTrustedClientIp,
  requestPhoneOtp,
  verifyTurnstile,
} from "@nozi/auth";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";

import { apiError, apiJson } from "../../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../../lib/api-security";

const requestSchema = z.object({
  phone: z.string().trim().min(9).max(30),
  turnstileToken: z.string().min(1).max(4096).optional(),
});

export async function POST(request: Request) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const input = requestSchema.parse(await request.json());
    const clientIp = getTrustedClientIp(request.headers);
    await verifyTurnstile({
      clientIp,
      ...(input.turnstileToken ? { token: input.turnstileToken } : {}),
    });
    const result = await requestPhoneOtp({ clientIp, phone: input.phone });
    logger.info({ statusCode: 202 }, "OTP request accepted");
    return apiJson(result, requestId, 202);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
