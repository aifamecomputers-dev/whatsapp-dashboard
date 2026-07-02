import { Worker } from "bullmq";
import { createRedisConnection } from "./queue/connection.js";
import { logger } from "./lib/logger.js";
import { processMetaEvent } from "./queue/processors/meta-event.processor.js";
import { processTwilioEvent } from "./queue/processors/twilio-event.processor.js";
import type { WebhookJobData } from "./queue/queues.js";

const metaWorker = new Worker<WebhookJobData>("meta-events", processMetaEvent, {
  connection: createRedisConnection(),
  concurrency: 10,
});

const twilioWorker = new Worker<WebhookJobData>("twilio-events", processTwilioEvent, {
  connection: createRedisConnection(),
  concurrency: 10,
});

for (const worker of [metaWorker, twilioWorker]) {
  worker.on("completed", (job) => logger.debug({ queue: worker.name, jobId: job.id }, "job completed"));
  worker.on("failed", (job, err) => logger.error({ queue: worker.name, jobId: job?.id, err }, "job failed"));
}

logger.info("server-worker started, listening on meta-events and twilio-events queues");

async function shutdown() {
  logger.info("server-worker shutting down...");
  await Promise.all([metaWorker.close(), twilioWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
