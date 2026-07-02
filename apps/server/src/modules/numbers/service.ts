import { eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { numberTeamAccess, phoneNumbers } from "../../db/schema.js";
import { decryptSecret, encryptSecret, maskSecret } from "../../lib/crypto.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import type { AuthenticatedUser } from "../../lib/rbac.js";
import { getAccessibleNumberIds } from "../../lib/rbac.js";

export interface CreateNumberInput {
  label: string;
  displayPhoneNumber: string;
  whatsappPhoneNumberId?: string;
  whatsappWabaId?: string;
  whatsappAccessToken?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneSid?: string;
  twilioTwimlAppSid?: string;
  twilioApiKeySid?: string;
  twilioApiKeySecret?: string;
  voiceEnabled?: boolean;
  teamIds?: string[];
}

function toPublicNumber(row: typeof phoneNumbers.$inferSelect, teamIds: string[]) {
  return {
    id: row.id,
    label: row.label,
    displayPhoneNumber: row.displayPhoneNumber,
    whatsappPhoneNumberId: row.whatsappPhoneNumberId,
    whatsappWabaId: row.whatsappWabaId,
    whatsappAccessTokenMasked: row.whatsappAccessTokenCiphertext
      ? maskSecret(decryptSecret({
          ciphertext: row.whatsappAccessTokenCiphertext,
          iv: row.whatsappAccessTokenIv!,
          tag: row.whatsappAccessTokenTag!,
        }))
      : null,
    whatsappVerifiedName: row.whatsappVerifiedName,
    whatsappStatus: row.whatsappStatus,
    twilioAccountSid: row.twilioAccountSid,
    twilioAuthTokenMasked: row.twilioAuthTokenCiphertext
      ? maskSecret(decryptSecret({
          ciphertext: row.twilioAuthTokenCiphertext,
          iv: row.twilioAuthTokenIv!,
          tag: row.twilioAuthTokenTag!,
        }))
      : null,
    twilioPhoneSid: row.twilioPhoneSid,
    twilioTwimlAppSid: row.twilioTwimlAppSid,
    twilioApiKeySid: row.twilioApiKeySid,
    twilioApiKeySecretMasked: row.twilioApiKeySecretCiphertext
      ? maskSecret(decryptSecret({
          ciphertext: row.twilioApiKeySecretCiphertext,
          iv: row.twilioApiKeySecretIv!,
          tag: row.twilioApiKeySecretTag!,
        }))
      : null,
    voiceEnabled: row.voiceEnabled,
    teamIds,
  };
}

export async function listNumbers(db: Database, user: AuthenticatedUser) {
  const accessibleIds = await getAccessibleNumberIds(db, user);
  if (accessibleIds.length === 0) return [];

  const rows = await db.select().from(phoneNumbers).where(inArray(phoneNumbers.id, accessibleIds));
  const accessRows = await db
    .select()
    .from(numberTeamAccess)
    .where(inArray(numberTeamAccess.numberId, accessibleIds));

  const teamIdsByNumber = new Map<string, string[]>();
  for (const r of accessRows) {
    const list = teamIdsByNumber.get(r.numberId) ?? [];
    list.push(r.teamId);
    teamIdsByNumber.set(r.numberId, list);
  }

  return rows.map((row) => toPublicNumber(row, teamIdsByNumber.get(row.id) ?? []));
}

export async function getNumberOr404(db: Database, numberId: string) {
  const [row] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.id, numberId)).limit(1);
  if (!row) throw new NotFoundError("Phone number not found");
  return row;
}

export async function createNumber(db: Database, input: CreateNumberInput) {
  if (!input.label || !input.displayPhoneNumber) {
    throw new ValidationError("label and displayPhoneNumber are required");
  }

  const whatsappEnc = input.whatsappAccessToken ? encryptSecret(input.whatsappAccessToken) : null;
  const twilioEnc = input.twilioAuthToken ? encryptSecret(input.twilioAuthToken) : null;
  const apiKeyEnc = input.twilioApiKeySecret ? encryptSecret(input.twilioApiKeySecret) : null;

  const [row] = await db
    .insert(phoneNumbers)
    .values({
      label: input.label,
      displayPhoneNumber: input.displayPhoneNumber,
      whatsappPhoneNumberId: input.whatsappPhoneNumberId,
      whatsappWabaId: input.whatsappWabaId,
      whatsappAccessTokenCiphertext: whatsappEnc?.ciphertext,
      whatsappAccessTokenIv: whatsappEnc?.iv,
      whatsappAccessTokenTag: whatsappEnc?.tag,
      whatsappStatus: whatsappEnc ? "connected" : "pending",
      twilioAccountSid: input.twilioAccountSid,
      twilioAuthTokenCiphertext: twilioEnc?.ciphertext,
      twilioAuthTokenIv: twilioEnc?.iv,
      twilioAuthTokenTag: twilioEnc?.tag,
      twilioPhoneSid: input.twilioPhoneSid,
      twilioTwimlAppSid: input.twilioTwimlAppSid,
      twilioApiKeySid: input.twilioApiKeySid,
      twilioApiKeySecretCiphertext: apiKeyEnc?.ciphertext,
      twilioApiKeySecretIv: apiKeyEnc?.iv,
      twilioApiKeySecretTag: apiKeyEnc?.tag,
      voiceEnabled: input.voiceEnabled ?? false,
    })
    .returning();

  if (input.teamIds?.length) {
    await db.insert(numberTeamAccess).values(input.teamIds.map((teamId) => ({ numberId: row.id, teamId })));
  }

  return toPublicNumber(row, input.teamIds ?? []);
}

export async function updateNumber(db: Database, numberId: string, input: Partial<CreateNumberInput>) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.displayPhoneNumber !== undefined) patch.displayPhoneNumber = input.displayPhoneNumber;
  if (input.whatsappPhoneNumberId !== undefined) patch.whatsappPhoneNumberId = input.whatsappPhoneNumberId;
  if (input.whatsappWabaId !== undefined) patch.whatsappWabaId = input.whatsappWabaId;
  if (input.whatsappAccessToken) {
    const enc = encryptSecret(input.whatsappAccessToken);
    patch.whatsappAccessTokenCiphertext = enc.ciphertext;
    patch.whatsappAccessTokenIv = enc.iv;
    patch.whatsappAccessTokenTag = enc.tag;
    patch.whatsappStatus = "connected";
  }
  if (input.twilioAccountSid !== undefined) patch.twilioAccountSid = input.twilioAccountSid;
  if (input.twilioAuthToken) {
    const enc = encryptSecret(input.twilioAuthToken);
    patch.twilioAuthTokenCiphertext = enc.ciphertext;
    patch.twilioAuthTokenIv = enc.iv;
    patch.twilioAuthTokenTag = enc.tag;
  }
  if (input.twilioPhoneSid !== undefined) patch.twilioPhoneSid = input.twilioPhoneSid;
  if (input.twilioTwimlAppSid !== undefined) patch.twilioTwimlAppSid = input.twilioTwimlAppSid;
  if (input.twilioApiKeySid !== undefined) patch.twilioApiKeySid = input.twilioApiKeySid;
  if (input.twilioApiKeySecret) {
    const enc = encryptSecret(input.twilioApiKeySecret);
    patch.twilioApiKeySecretCiphertext = enc.ciphertext;
    patch.twilioApiKeySecretIv = enc.iv;
    patch.twilioApiKeySecretTag = enc.tag;
  }
  if (input.voiceEnabled !== undefined) patch.voiceEnabled = input.voiceEnabled;

  const [row] = await db.update(phoneNumbers).set(patch).where(eq(phoneNumbers.id, numberId)).returning();
  if (!row) throw new NotFoundError("Phone number not found");

  if (input.teamIds) {
    await db.delete(numberTeamAccess).where(eq(numberTeamAccess.numberId, numberId));
    if (input.teamIds.length) {
      await db.insert(numberTeamAccess).values(input.teamIds.map((teamId) => ({ numberId, teamId })));
    }
  }

  const accessRows = await db
    .select({ teamId: numberTeamAccess.teamId })
    .from(numberTeamAccess)
    .where(eq(numberTeamAccess.numberId, numberId));

  return toPublicNumber(row, accessRows.map((r) => r.teamId));
}

export async function deleteNumber(db: Database, numberId: string): Promise<void> {
  const result = await db.delete(phoneNumbers).where(eq(phoneNumbers.id, numberId)).returning({ id: phoneNumbers.id });
  if (result.length === 0) throw new NotFoundError("Phone number not found");
}

/** Internal helper for the WhatsApp integration layer — never exposed over HTTP. */
export async function getDecryptedWhatsappCredentials(
  db: Database,
  numberId: string,
): Promise<{ phoneNumberId: string; wabaId: string; accessToken: string }> {
  const row = await getNumberOr404(db, numberId);
  if (!row.whatsappPhoneNumberId || !row.whatsappAccessTokenCiphertext || !row.whatsappAccessTokenIv || !row.whatsappAccessTokenTag) {
    throw new ValidationError("This number is not configured for WhatsApp messaging");
  }
  return {
    phoneNumberId: row.whatsappPhoneNumberId,
    wabaId: row.whatsappWabaId ?? "",
    accessToken: decryptSecret({
      ciphertext: row.whatsappAccessTokenCiphertext,
      iv: row.whatsappAccessTokenIv,
      tag: row.whatsappAccessTokenTag,
    }),
  };
}

/** Internal helper for the Twilio integration layer — never exposed over HTTP. */
export async function getDecryptedTwilioCredentials(
  db: Database,
  numberId: string,
): Promise<{
  accountSid: string;
  authToken: string;
  twimlAppSid: string | null;
  apiKeySid: string | null;
  apiKeySecret: string | null;
}> {
  const row = await getNumberOr404(db, numberId);
  if (!row.twilioAccountSid || !row.twilioAuthTokenCiphertext || !row.twilioAuthTokenIv || !row.twilioAuthTokenTag) {
    throw new ValidationError("This number is not configured for Twilio voice");
  }
  return {
    accountSid: row.twilioAccountSid,
    authToken: decryptSecret({
      ciphertext: row.twilioAuthTokenCiphertext,
      iv: row.twilioAuthTokenIv,
      tag: row.twilioAuthTokenTag,
    }),
    twimlAppSid: row.twilioTwimlAppSid,
    apiKeySid: row.twilioApiKeySid,
    apiKeySecret:
      row.twilioApiKeySecretCiphertext && row.twilioApiKeySecretIv && row.twilioApiKeySecretTag
        ? decryptSecret({
            ciphertext: row.twilioApiKeySecretCiphertext,
            iv: row.twilioApiKeySecretIv,
            tag: row.twilioApiKeySecretTag,
          })
        : null,
  };
}

export async function findNumberByWhatsappPhoneNumberId(db: Database, whatsappPhoneNumberId: string) {
  const [row] = await db
    .select()
    .from(phoneNumbers)
    .where(eq(phoneNumbers.whatsappPhoneNumberId, whatsappPhoneNumberId))
    .limit(1);
  return row ?? null;
}

export async function findNumberByDisplayPhone(db: Database, displayPhoneNumber: string) {
  const [row] = await db
    .select()
    .from(phoneNumbers)
    .where(eq(phoneNumbers.displayPhoneNumber, displayPhoneNumber))
    .limit(1);
  return row ?? null;
}
