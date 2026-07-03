import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const teamRoleEnum = pgEnum("team_role", ["team_admin", "agent", "viewer"]);
export const whatsappStatusEnum = pgEnum("whatsapp_status", ["pending", "connected", "disconnected"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "pending", "closed"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "location",
  "template",
  "interactive",
]);
export const messageStatusEnum = pgEnum("message_status", ["pending", "sent", "delivered", "read", "failed"]);
export const callDirectionEnum = pgEnum("call_direction", ["inbound", "outbound"]);
// WhatsApp Calling API call-event outcomes we log (no media/answer flow — see
// modules/calls — so most inbound calls end up "missed" unless a WhatsApp
// client elsewhere answers them; there is no "in-progress"/"completed" concept
// on our side since we never join the call).
export const callStatusEnum = pgEnum("call_status", ["ringing", "missed", "rejected", "terminated", "failed"]);
export const webhookSourceEnum = pgEnum("webhook_source", ["meta"]);
export const webhookEventStatusEnum = pgEnum("webhook_event_status", ["pending", "processed", "failed"]);

// ---------- Core identity ----------
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
}));

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.userId] }),
  }),
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Phone numbers (WhatsApp Cloud API messaging + Calling) ----------
export const phoneNumbers = pgTable("phone_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  displayPhoneNumber: text("display_phone_number").notNull(),

  // WhatsApp Cloud API
  whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
  whatsappWabaId: text("whatsapp_waba_id"),
  whatsappAccessTokenCiphertext: text("whatsapp_access_token_ciphertext"),
  whatsappAccessTokenIv: text("whatsapp_access_token_iv"),
  whatsappAccessTokenTag: text("whatsapp_access_token_tag"),
  whatsappVerifiedName: text("whatsapp_verified_name"),
  whatsappStatus: whatsappStatusEnum("whatsapp_status").notNull().default("pending"),
  // WhatsApp Business Calling API (voice call-event logging only — see modules/calls;
  // we never answer calls or handle media, so this just gates whether we expect/show
  // call-log activity for this number).
  whatsappCallingEnabled: boolean("whatsapp_calling_enabled").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  displayPhoneUnique: uniqueIndex("phone_numbers_display_phone_unique").on(t.displayPhoneNumber),
  whatsappPhoneIdUnique: uniqueIndex("phone_numbers_whatsapp_phone_id_unique").on(t.whatsappPhoneNumberId),
}));

export const numberTeamAccess = pgTable(
  "number_team_access",
  {
    numberId: uuid("number_id").notNull().references(() => phoneNumbers.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.numberId, t.teamId] }),
  }),
);

// ---------- Conversations & Messages ----------
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numberId: uuid("number_id").notNull().references(() => phoneNumbers.id, { onDelete: "cascade" }),
    contactWaId: text("contact_wa_id").notNull(),
    contactName: text("contact_name"),
    status: conversationStatusEnum("status").notNull().default("open"),
    assignedAgentId: uuid("assigned_agent_id").references(() => users.id, { onDelete: "set null" }),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    numberContactUnique: uniqueIndex("conversations_number_contact_unique").on(t.numberId, t.contactWaId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    waMessageId: text("wa_message_id"),
    messageType: messageTypeEnum("message_type").notNull(),
    body: text("body"),
    mediaId: text("media_id"),
    mediaLocalPath: text("media_local_path"),
    mediaMimeType: text("media_mime_type"),
    templateName: text("template_name"),
    status: messageStatusEnum("status").notNull().default("pending"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    waMessageIdUnique: uniqueIndex("messages_wa_message_id_unique").on(t.waMessageId),
    conversationIdx: index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  }),
);

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numberId: uuid("number_id").notNull().references(() => phoneNumbers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    components: jsonb("components").notNull().default(sql`'[]'::jsonb`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    numberNameLangUnique: uniqueIndex("message_templates_number_name_lang_unique").on(
      t.numberId,
      t.name,
      t.language,
    ),
  }),
);

// ---------- Calls (WhatsApp Calling API — event log only, no media/answer) ----------
export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numberId: uuid("number_id").notNull().references(() => phoneNumbers.id, { onDelete: "cascade" }),
    // Meta's call-event id (from the webhook payload), used to correlate the
    // connect/terminate events belonging to the same call.
    whatsappCallId: text("whatsapp_call_id"),
    direction: callDirectionEnum("direction").notNull(),
    fromWaId: text("from_wa_id").notNull(),
    toWaId: text("to_wa_id").notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    status: callStatusEnum("status").notNull().default("ringing"),
    durationSeconds: integer("duration_seconds"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    whatsappCallIdUnique: uniqueIndex("calls_whatsapp_call_id_unique").on(t.whatsappCallId),
    numberIdx: index("calls_number_idx").on(t.numberId, t.createdAt),
  }),
);

// ---------- Audit & webhook forensics ----------
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ipAddress: inet("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: webhookSourceEnum("source").notNull(),
  eventType: text("event_type").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  signatureValid: boolean("signature_valid").notNull(),
  status: webhookEventStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// ---------- Relations (for query builder ergonomics) ----------
export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  numberAccess: many(numberTeamAccess),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMemberships: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const phoneNumbersRelations = relations(phoneNumbers, ({ many }) => ({
  teamAccess: many(numberTeamAccess),
  conversations: many(conversations),
  calls: many(calls),
}));

export const numberTeamAccessRelations = relations(numberTeamAccess, ({ one }) => ({
  number: one(phoneNumbers, { fields: [numberTeamAccess.numberId], references: [phoneNumbers.id] }),
  team: one(teams, { fields: [numberTeamAccess.teamId], references: [teams.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  number: one(phoneNumbers, { fields: [conversations.numberId], references: [phoneNumbers.id] }),
  assignedAgent: one(users, { fields: [conversations.assignedAgentId], references: [users.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  sentByUser: one(users, { fields: [messages.sentByUserId], references: [users.id] }),
}));

export const callsRelations = relations(calls, ({ one }) => ({
  number: one(phoneNumbers, { fields: [calls.numberId], references: [phoneNumbers.id] }),
  team: one(teams, { fields: [calls.teamId], references: [teams.id] }),
}));
