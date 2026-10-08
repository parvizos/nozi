import { activateCourier, courierActivationSchema } from "@nozi/marketplace";
import { getRequestContext } from "@nozi/observability";
import { z } from "zod";

import { apiError, apiJson } from "../../../../../../lib/api-response";
import { assertTrustedOrigin } from "../../../../../../lib/api-security";

const tokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { logger, requestId } = getRequestContext(request);
  try {
    assertTrustedOrigin(request);
    const token = tokenSchema.parse((await params).token);
    const result = await activateCourier(
      token,
      courierActivationSchema.parse(await request.json()),
      requestId,
    );
    return apiJson(result, requestId);
  } catch (error) {
    return apiError(error, requestId, logger);
  }
}
