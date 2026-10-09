import { createServer } from "node:http";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

import { getEnv } from "@nozi/config";
import { prisma } from "@nozi/database";
import { expireStaleOrders } from "@nozi/marketplace";
import {
  runCleanupJobs,
  runOutboxBatch,
  updateWorkerHeartbeat,
} from "@nozi/notifications";
import { childLogger } from "@nozi/observability";

const env = getEnv();
const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const startedAt = new Date();
const logger = childLogger({ component: "worker", workerId });
let stopping = false;
let databaseReady = false;
let lastStaleRun = 0;
let lastCleanupRun = 0;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const server = createServer(async (request, response) => {
  if (request.url === "/health/live") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", workerId }));
    return;
  }
  if (request.url === "/health/ready") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseReady = true;
    } catch {
      databaseReady = false;
    }
    response.writeHead(databaseReady ? 200 : 503, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({ database: databaseReady ? "up" : "down", workerId }),
    );
    return;
  }
  response.writeHead(404).end();
});

async function tick(): Promise<void> {
  const now = Date.now();
  await updateWorkerHeartbeat(workerId, startedAt);
  databaseReady = true;
  const batch = await runOutboxBatch(workerId);
  if (batch.claimed > 0) logger.info(batch, "outbox batch processed");

  if (now - lastStaleRun >= env.STALE_ORDER_INTERVAL_SECONDS * 1_000) {
    const expired = await expireStaleOrders(new Date(now));
    lastStaleRun = now;
    if (expired.expiredOrderIds.length > 0)
      logger.info(
        { expiredCount: expired.expiredOrderIds.length },
        "stale orders expired",
      );
  }
  if (now - lastCleanupRun >= env.CLEANUP_INTERVAL_MINUTES * 60_000) {
    const cleanup = await runCleanupJobs(new Date(now));
    lastCleanupRun = now;
    logger.info(cleanup, "scheduled cleanup completed");
  }
}

async function run(): Promise<void> {
  server.listen(env.WORKER_PORT, "0.0.0.0", () => {
    logger.info({ port: env.WORKER_PORT }, "worker health server listening");
  });
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      databaseReady = false;
      logger.error({ err: error }, "worker tick failed");
    }
    if (!stopping) await delay(env.OUTBOX_POLL_INTERVAL_MS);
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "worker shutting down");
  server.close();
  await prisma.workerHeartbeat.updateMany({
    data: { lastSeenAt: new Date(), status: "STOPPED" },
    where: { workerId },
  });
  await prisma.$disconnect();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await run();
