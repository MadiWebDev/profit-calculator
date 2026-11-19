import { describe, it, expect } from "vitest";
import {
  SUPPRESSION_REASONS,
  SUPPRESSION_SOURCES,
  isValidSuppressionReason,
  normalizeSuppressionIdentifier,
} from "@/lib/suppression";

describe("normalizeSuppressionIdentifier", () => {
  it("lowercases and trims email identifiers so the same address is one suppression", () => {
    expect(normalizeSuppressionIdentifier("  Ayesha@Example.COM ", "email")).toBe(
      "ayesha@example.com"
    );
    expect(normalizeSuppressionIdentifier("ayesha@example.com", "email")).toBe(
      "ayesha@example.com"
    );
  });

  it("trims phone identifiers without lowercasing them", () => {
    expect(normalizeSuppressionIdentifier("  +923001234567 ", "whatsapp")).toBe(
      "+923001234567"
    );
  });

  it("handles an empty identifier without throwing", () => {
    expect(normalizeSuppressionIdentifier("", "email")).toBe("");
  });
});

describe("isValidSuppressionReason", () => {
  it("accepts every reason in the list", () => {
    for (const reason of SUPPRESSION_REASONS) {
      expect(isValidSuppressionReason(reason)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isValidSuppressionReason("spam")).toBe(false);
    expect(isValidSuppressionReason("")).toBe(false);
    expect(isValidSuppressionReason("UNSUBSCRIBED")).toBe(false);
  });
});

describe("suppression vocabularies", () => {
  it("has the reasons and sources the send flow needs", () => {
    expect(SUPPRESSION_REASONS).toEqual(
      expect.arrayContaining(["unsubscribed", "bounced", "complained", "manual", "invalid"])
    );
    expect(SUPPRESSION_SOURCES).toEqual(
      expect.arrayContaining(["unsubscribe_link", "reply", "webhook", "admin", "bounce"])
    );
  });
});
