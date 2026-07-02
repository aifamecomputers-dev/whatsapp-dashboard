import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveWebhookChallenge, verifyMetaSignature } from "./meta.verify.js";

const APP_SECRET = "test-meta-app-secret"; // matches src/test/setupEnv.ts

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(Buffer.from(body)).digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaSignature(Buffer.from(body), sign(body))).toBe(true);
  });

  it("rejects a body whose signature doesn't match", () => {
    const body = JSON.stringify({ hello: "world" });
    const wrongSignature = sign(JSON.stringify({ hello: "tampered" }));
    expect(verifyMetaSignature(Buffer.from(body), wrongSignature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature(Buffer.from("{}"), undefined)).toBe(false);
  });

  it("rejects a header missing the sha256= prefix", () => {
    const body = "{}";
    const raw = createHmac("sha256", APP_SECRET).update(Buffer.from(body)).digest("hex");
    expect(verifyMetaSignature(Buffer.from(body), raw)).toBe(false);
  });

  it("rejects a signature computed against different raw bytes (whitespace matters)", () => {
    const original = JSON.stringify({ a: 1 });
    const reformatted = JSON.stringify({ a: 1 }, null, 2); // same JSON value, different bytes
    expect(verifyMetaSignature(Buffer.from(reformatted), sign(original))).toBe(false);
  });
});

describe("resolveWebhookChallenge", () => {
  it("echoes the challenge when mode and verify token match", () => {
    const challenge = resolveWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": "test-verify-token",
      "hub.challenge": "12345",
    });
    expect(challenge).toBe("12345");
  });

  it("returns null when the verify token is wrong", () => {
    const challenge = resolveWebhookChallenge({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "12345",
    });
    expect(challenge).toBeNull();
  });

  it("returns null when mode is not subscribe", () => {
    const challenge = resolveWebhookChallenge({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "test-verify-token",
      "hub.challenge": "12345",
    });
    expect(challenge).toBeNull();
  });
});
