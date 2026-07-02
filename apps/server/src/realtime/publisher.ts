import { Emitter } from "@socket.io/redis-emitter";
import type { SocketEventName } from "@whatsapp-dashboard/shared";
import { createRedisConnection } from "../queue/connection.js";

/**
 * Lets the worker process (which does not run its own Socket.IO server) emit
 * events into the rooms managed by server-web's Socket.IO + redis-adapter
 * cluster, by publishing directly onto the adapter's Redis channels. This is
 * the write-side counterpart to `io.adapter(createAdapter(...))` in
 * realtime/socket.ts, and avoids the duplicate-delivery problems that a
 * hand-rolled pub/sub-then-re-emit bridge would introduce with multiple
 * server-web replicas.
 */
let emitter: Emitter | null = null;

function getEmitter(): Emitter {
  if (!emitter) {
    emitter = new Emitter(createRedisConnection());
  }
  return emitter;
}

export function emitToNumber(numberId: string, event: SocketEventName, payload: unknown): void {
  getEmitter().to(`number:${numberId}`).emit(event, payload);
}

export function emitToTeam(teamId: string, event: SocketEventName, payload: unknown): void {
  getEmitter().to(`team:${teamId}`).emit(event, payload);
}
