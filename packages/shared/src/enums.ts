export const TEAM_ROLES = ["team_admin", "agent", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const WHATSAPP_STATUSES = ["pending", "connected", "disconnected"] as const;
export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

export const CONVERSATION_STATUSES = ["open", "pending", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "location",
  "template",
  "interactive",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = ["pending", "sent", "delivered", "read", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CALL_DIRECTIONS = ["inbound", "outbound"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

// WhatsApp Calling API call-event log only — we never answer/join a call (no
// WebRTC media handling), so there's no "in-progress"/"completed" state on our
// side, just the outcome of ringing.
export const CALL_STATUSES = ["ringing", "missed", "rejected", "terminated", "failed"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const WEBHOOK_SOURCES = ["meta"] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];

export const WEBHOOK_EVENT_STATUSES = ["pending", "processed", "failed"] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const SOCKET_EVENTS = {
  MESSAGE_NEW: "message:new",
  MESSAGE_STATUS: "message:status",
  CALL_STATUS: "call:status",
} as const;
export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
