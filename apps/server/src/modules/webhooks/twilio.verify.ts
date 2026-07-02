import twilio from "twilio";

/**
 * Twilio signs the canonical reconstruction of (URL + sorted form params), not the raw
 * request bytes, so — unlike Meta — we can parse the form body into an object first and
 * still verify correctly, as long as `url` is the exact public HTTPS URL Twilio invoked
 * (including query string, if any) and `params` holds the exact decoded form values.
 */
export function verifyTwilioSignature(params: {
  authToken: string;
  signatureHeader: string | undefined;
  url: string;
  body: Record<string, string>;
}): boolean {
  if (!params.signatureHeader) return false;
  return twilio.validateRequest(params.authToken, params.signatureHeader, params.url, params.body);
}

export function parseFormBody(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) result[key] = value;
  return result;
}
