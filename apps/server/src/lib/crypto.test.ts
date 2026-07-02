import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret, safeCompare } from "./crypto.js";

describe("crypto", () => {
  it("round-trips a secret through encrypt/decrypt", () => {
    const plaintext = "EAAG_this_looks_like_a_meta_access_token_1234567890";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt if the auth tag is tampered with", () => {
    const encrypted = encryptSecret("secret-value");
    const tampered = { ...encrypted, tag: encrypted.tag.slice(0, -2) + (encrypted.tag.endsWith("00") ? "11" : "00") };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("masks a secret leaving only a short prefix/suffix visible", () => {
    const masked = maskSecret("EAAG1234567890abcdef");
    expect(masked.startsWith("EAAG")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).not.toContain("1234567890");
  });

  it("safeCompare returns true only for identical strings", () => {
    expect(safeCompare("abc123", "abc123")).toBe(true);
    expect(safeCompare("abc123", "abc124")).toBe(false);
    expect(safeCompare("short", "muchlonger")).toBe(false);
  });
});
