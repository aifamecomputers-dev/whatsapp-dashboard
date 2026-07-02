import type {
  CallDirection,
  CallStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  TeamRole,
  WhatsappStatus,
} from "./enums.js";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface TeamDTO {
  id: string;
  name: string;
  createdAt: string;
}

export interface TeamMembershipDTO {
  teamId: string;
  userId: string;
  role: TeamRole;
}

export interface PhoneNumberDTO {
  id: string;
  label: string;
  displayPhoneNumber: string;
  whatsappStatus: WhatsappStatus;
  whatsappVerifiedName: string | null;
  voiceEnabled: boolean;
  teamIds: string[];
}

export interface ConversationDTO {
  id: string;
  numberId: string;
  contactWaId: string;
  contactName: string | null;
  status: ConversationStatus;
  assignedAgentId: string | null;
  lastCustomerMessageAt: string | null;
  sessionExpiresAt: string | null;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  waMessageId: string | null;
  messageType: MessageType;
  body: string | null;
  mediaLocalPath: string | null;
  mediaMimeType: string | null;
  templateName: string | null;
  status: MessageStatus;
  errorMessage: string | null;
  sentByUserId: string | null;
  createdAt: string;
}

export interface MessageTemplateDTO {
  id: string;
  numberId: string;
  name: string;
  language: string;
  category: string;
  status: string;
}

export interface CallDTO {
  id: string;
  numberId: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  teamId: string | null;
  agentId: string | null;
  status: CallStatus;
  durationSeconds: number | null;
  hasRecording: boolean;
  recordingDurationSeconds: number | null;
  consentNoticePlayed: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}
