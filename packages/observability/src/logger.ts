import pino, { type Logger, type LoggerOptions } from "pino";

import { getEnv } from "@nozi/config";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "password",
  "passwordHash",
  "token",
  "secret",
  "email",
  "phone",
  "phoneE164",
  "address",
];

function createLogger(): Logger {
  const env = getEnv();
  const options: LoggerOptions = {
    base: {
      service: "nozi-web",
    },
    level: env.LOG_LEVEL,
    redact: {
      paths: REDACTED_PATHS,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(options);
}

let loggerInstance: Logger | undefined;

export function getLogger(): Logger {
  loggerInstance ??= createLogger();
  return loggerInstance;
}

export function childLogger(
  bindings: Record<string, string | number | boolean>,
): Logger {
  return getLogger().child(bindings);
}
