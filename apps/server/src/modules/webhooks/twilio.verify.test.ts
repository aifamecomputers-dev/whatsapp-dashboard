import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseFormBody, verifyTwilioSignature } from "./twilio.verify.js";

const AUTH_TOKEN = "test-twilio-auth-token";

/**
 * Reimplements Twilio's documented signing algorithm independently of the `twilio`
 * SDK, so this test doesn't just check that our code agrees with itself: sort POST
 * params by key, concatenate key+value pairs onto the URL, HMAC-SHA1 with the auth
 * token, base64-encode.
 */
function signTwilioRequest(url: string, params: Record<string, string>, authToken = AUTH_TOKEN): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("verifyTwilioSignature", () => {
  const url = "https://test.example.com/webhooks/twilio/voice/inbound";
  const params = { CallSid: "CA123", From: "+15550001111", To: "+15559998888" };

  it("accepts a correctly signed request", () => {
    const signature = signTwilioRequest(url, params);
    expect(verifyTwilioSignature({ authToken: AUTH_TOKEN, signatureHeader: signature, url, body: params })).toBe(true);
  });

  it("rejects a request signed with the wrong auth token", () => {
    const signature = signTwilioRequest(url, params, "a-different-auth-token");
    expect(verifyTwilioSignature({ authToken: AUTH_TOKEN, signatureHeader: signature, url, body: params })).toBe(false);
  });

  it("rejects a request whose params were tampered with after signing", () => {
    const signature = signTwilioRequest(url, params);
    const tamperedParams = { ...params, From: "+19998887777" };
    expect(
      verifyTwilioSignature({ authToken: AUTH_TOKEN, signatureHeader: signature, url, body: tamperedParams }),
    ).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyTwilioSignature({ authToken: AUTH_TOKEN, signatureHeader: undefined, url, body: params })).toBe(false);
  });

  it("rejects when the URL does not match what was signed (e.g. wrong PUBLIC_BASE_URL)", () => {
    const signature = signTwilioRequest(url, params);
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        signatureHeader: signature,
        url: "https://different-host.example.com/webhooks/twilio/voice/inbound",
        body: params,
      }),
    ).toBe(false);
  });
});

describe("parseFormBody", () => {
  it("decodes an x-www-form-urlencoded body into a flat string map", () => {
    const parsed = parseFormBody("CallSid=CA123&From=%2B15550001111&To=%2B15559998888");
    expect(parsed).toEqual({ CallSid: "CA123", From: "+15550001111", To: "+15559998888" });
  });

  it("handles an empty body", () => {
    expect(parseFormBody("")).toEqual({});
  });
});
