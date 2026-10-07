import { NextResponse } from "next/server";

import { getRequestContext, REQUEST_ID_HEADER } from "@nozi/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): NextResponse {
  const startedAt = performance.now();
  const { logger, requestId } = getRequestContext(request);
  const response = NextResponse.json({ requestId, status: "ok" });

  response.headers.set(REQUEST_ID_HEADER, requestId);
  logger.info(
    { durationMs: performance.now() - startedAt, statusCode: 200 },
    "liveness check",
  );

  return response;
}
