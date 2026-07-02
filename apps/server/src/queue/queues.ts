import { Queue } from "bullmq";
import { createRedisConnection } from "./connection.js";

export interface WebhookJobData {
  webhookEventId: string;
}

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

// Lazily constructed so importing this module doesn't open a Redis connection
// (useful for unit tests that import route modules without a running Redis).
let metaQueue: Queue<WebhookJobData> | null = null;
let twilioQueue: Queue<WebhookJobData> | null = null;

export function getMetaEventQueue(): Queue<WebhookJobData> {
  if (!metaQueue) {
    metaQueue = new Queue<WebhookJobData>("meta-events", {
      connection: createRedisConnection(),
      defaultJobOptions,
    });
  }
  return metaQueue;
}

export function getTwilioEventQueue(): Queue<WebhookJobData> {
  if (!twilioQueue) {
    twilioQueue = new Queue<WebhookJobData>("twilio-events", {
      connection: createRedisConnection(),
      defaultJobOptions,
    });
  }
  return twilioQueue;
}
