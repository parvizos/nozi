import { randomUUID } from "node:crypto";

import type { Logger } from "pino";

import { childLogger } from "./logger";

export const REQUEST_ID_HEADER = "x-request-id";

export function getRequestContext(request: Request): {
  logger: Logger;
  requestId: string;
} {
  const incomingRequestId = request.headers.get(REQUEST_ID_HEADER);
  const requestId =
    incomingRequestId && incomingRequestId.length <= 100
      ? incomingRequestId
      : randomUUID();

  return {
    logger: childLogger({
      method: request.method,
      requestId,
      url: new URL(request.url).pathname,
    }),
    requestId,
  };
}
