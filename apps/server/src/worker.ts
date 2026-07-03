import { Worker } from "bullmq";
import { createRedisConnection } from "./queue/connection.js";
import { logger } from "./lib/logger.js";
import { processMetaEvent } from "./queue/processors/meta-event.processor.js";
import type { WebhookJobData } from "./queue/queues.js";

const metaWorker = new Worker<WebhookJobData>("meta-events", processMetaEvent, {
  connection: createRedisConnection(),
  concurrency: 10,
});

metaWorker.on("completed", (job) => logger.debug({ jobId: job.id }, "job completed"));
metaWorker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));

logger.info("server-worker started, listening on meta-events queue");

async function shutdown() {
  logger.info("server-worker shutting down...");
  await metaWorker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
