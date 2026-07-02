import { describe, expect, it, vi, afterEach } from "vitest";
import { isSessionOpen, sessionExpiresAt } from "./service.js";

describe("sessionExpiresAt", () => {
  it("returns null when there has been no customer message yet", () => {
    expect(sessionExpiresAt(null)).toBeNull();
  });

  it("returns exactly 24 hours after the last customer message", () => {
    const last = new Date("2026-01-01T00:00:00.000Z");
    const expiry = sessionExpiresAt(last);
    expect(expiry?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("isSessionOpen", () => {
  afterEach(() => vi.useRealTimers());

  it("is false when there has been no customer message", () => {
    expect(isSessionOpen(null)).toBe(false);
  });

  it("is true just before the 24h window closes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T23:59:00.000Z"));
    expect(isSessionOpen(new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("is false just after the 24h window closes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:01.000Z"));
    expect(isSessionOpen(new Date("2026-01-01T00:00:00.000Z"))).toBe(false);
  });
});
