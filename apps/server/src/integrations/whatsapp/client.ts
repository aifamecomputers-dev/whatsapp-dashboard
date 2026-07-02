import { env } from "../../config/env.js";

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function graphFetch(url: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = (body as GraphErrorBody)?.error?.message ?? `Graph API request failed (${res.status})`;
    throw new WhatsAppApiError(message, res.status, body);
  }
  return body;
}

export interface SendTextResult {
  messages: Array<{ id: string }>;
}

/** Sends a free-form text message. Only valid within the 24h customer-service session window. */
export async function sendTextMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}): Promise<SendTextResult> {
  const result = await graphFetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, params.accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: { body: params.body },
    }),
  });
  return result as SendTextResult;
}

/** Sends an approved template message. Required to initiate/re-open contact outside the 24h window. */
export async function sendTemplateMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}): Promise<SendTextResult> {
  const result = await graphFetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, params.accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        components: params.components ?? [],
      },
    }),
  });
  return result as SendTextResult;
}

export async function markMessageAsRead(params: {
  phoneNumberId: string;
  accessToken: string;
  waMessageId: string;
}): Promise<void> {
  await graphFetch(`${GRAPH_BASE}/${params.phoneNumberId}/messages`, params.accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: params.waMessageId,
    }),
  });
}

interface MediaUrlResponse {
  url: string;
  mime_type: string;
  file_size: number;
  id: string;
}

/**
 * Resolves a media id to a short-lived download URL (~5 min), then downloads it immediately.
 * Both requests must carry the number's bearer token — the URL is not publicly fetchable.
 */
export async function downloadMedia(params: {
  mediaId: string;
  accessToken: string;
}): Promise<{ bytes: Buffer; mimeType: string }> {
  const meta = (await graphFetch(`${GRAPH_BASE}/${params.mediaId}`, params.accessToken)) as MediaUrlResponse;
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${params.accessToken}` } });
  if (!res.ok) {
    throw new WhatsAppApiError(`Failed to download media (${res.status})`, res.status, undefined);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), mimeType: meta.mime_type };
}

interface TemplateListResponse {
  data: Array<{
    name: string;
    language: string;
    category: string;
    status: string;
    components: unknown[];
  }>;
}

export async function listApprovedTemplates(params: {
  wabaId: string;
  accessToken: string;
}): Promise<TemplateListResponse["data"]> {
  const result = (await graphFetch(
    `${GRAPH_BASE}/${params.wabaId}/message_templates?limit=250`,
    params.accessToken,
  )) as TemplateListResponse;
  return result.data;
}
