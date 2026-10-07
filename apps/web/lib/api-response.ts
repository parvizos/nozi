import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError } from "@nozi/auth";
import { MarketplaceError } from "@nozi/marketplace";
import type { getRequestContext } from "@nozi/observability";
import { REQUEST_ID_HEADER } from "@nozi/observability";

type RequestLogger = ReturnType<typeof getRequestContext>["logger"];

export function apiJson(
  body: unknown,
  requestId: string,
  status = 200,
): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function apiError(
  error: unknown,
  requestId: string,
  logger: RequestLogger,
): NextResponse {
  if (error instanceof AuthorizationError) {
    logger.warn(
      { code: error.code, statusCode: error.status },
      "request denied",
    );
    return apiJson(
      { code: error.code, message: error.message, requestId },
      requestId,
      error.status,
    );
  }
  if (error instanceof MarketplaceError) {
    logger.warn(
      { code: error.code, statusCode: error.status },
      "domain request rejected",
    );
    return apiJson(
      {
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
        message: error.message,
        requestId,
      },
      requestId,
      error.status,
    );
  }
  if (error instanceof z.ZodError) {
    logger.warn(
      { code: "VALIDATION_ERROR", statusCode: 400 },
      "request validation failed",
    );
    return apiJson(
      {
        code: "VALIDATION_ERROR",
        fieldErrors: z.flattenError(error).fieldErrors,
        message: "Проверьте введённые данные",
        requestId,
      },
      requestId,
      400,
    );
  }
  logger.error({ err: error, statusCode: 500 }, "request failed");
  return apiJson(
    {
      code: "INTERNAL_ERROR",
      message: "Не удалось выполнить запрос",
      requestId,
    },
    requestId,
    500,
  );
}
