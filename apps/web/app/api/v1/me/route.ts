import { NextResponse } from "next/server";

import { AuthorizationError, requireActorContext } from "@nozi/auth";
import { getRequestContext, REQUEST_ID_HEADER } from "@nozi/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const { logger, requestId } = getRequestContext(request);

  try {
    const actor = await requireActorContext(request.headers);
    const response = NextResponse.json({
      data: {
        permissions: [...actor.permissions].sort(),
        roles: [...actor.roles].sort(),
        userId: actor.userId,
      },
      requestId,
    });

    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      logger.warn(
        { code: error.code, statusCode: error.status },
        "authorization denied",
      );
      const response = NextResponse.json(
        { code: error.code, message: error.message, requestId },
        { status: error.status },
      );
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    }

    logger.error(
      { err: error, statusCode: 500 },
      "current actor lookup failed",
    );
    const response = NextResponse.json(
      {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId,
      },
      { status: 500 },
    );
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }
}
