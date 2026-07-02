import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Single shared Redis connection factory. BullMQ requires `maxRetriesPerRequest: null`
 * on connections used by Workers/QueueEvents (blocking commands would otherwise be
 * retried in a way that breaks BullMQ's internal polling).
 *
 * An explicit 'error' listener is required: without one, ioredis logs a noisy
 * "missing 'error' handler" warning on every failed connection attempt, and in
 * some Node versions an unhandled 'error' event on an EventEmitter can crash the
 * process outright.
 */
export function createRedisConnection(): Redis {
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  client.on("error", (err) => logger.error({ err }, "Redis connection error"));
  return client;
}
