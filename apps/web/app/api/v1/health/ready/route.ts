import { NextResponse } from "next/server";

import { prisma } from "@nozi/database";
import { getRequestContext, REQUEST_ID_HEADER } from "@nozi/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = performance.now();
  const { logger, requestId } = getRequestContext(request);

  try {
    await prisma.$queryRaw`SELECT 1`;
    const response = NextResponse.json({
      checks: { database: "ok" },
      requestId,
      status: "ok",
    });

    response.headers.set(REQUEST_ID_HEADER, requestId);
    logger.info(
      { durationMs: performance.now() - startedAt, statusCode: 200 },
      "readiness check",
    );
    return response;
  } catch (error) {
    logger.error(
      {
        durationMs: performance.now() - startedAt,
        err: error,
        statusCode: 503,
      },
      "readiness check failed",
    );
    const response = NextResponse.json(
      {
        checks: { database: "unavailable" },
        code: "SERVICE_UNAVAILABLE",
        message: "A required service is unavailable",
        requestId,
        status: "error",
      },
      { status: 503 },
    );

    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }
}
