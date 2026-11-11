import { describe, it, expect } from "vitest";
import {
  HELP_FAQS,
  GLOSSARY_TERMS,
  HELP_FAQ_CATEGORIES,
  groupFaqsByCategory,
  searchHelpItems,
} from "@/lib/help-content";

describe("searchHelpItems", () => {
  const items = [
    { title: "Connect Shopify", body: "OAuth flow for your store" },
    { title: "Connect Meta ads", body: "Facebook ad accounts sync" },
    { title: "Read your profit", body: "Net margin and ROAS explained" },
  ];

  it("returns everything for an empty query", () => {
    expect(searchHelpItems(items, "", ["title", "body"])).toEqual(items);
    expect(searchHelpItems(items, "   ", ["title", "body"])).toEqual(items);
  });

  it("matches case-insensitively across fields", () => {
    expect(searchHelpItems(items, "SHOPIFY", ["title", "body"])).toHaveLength(1);
    expect(searchHelpItems(items, "oauth", ["title", "body"])).toHaveLength(1);
  });

  it("requires every word to match somewhere (AND across words)", () => {
    expect(searchHelpItems(items, "connect meta", ["title", "body"])).toHaveLength(1);
    expect(searchHelpItems(items, "connect profit", ["title", "body"])).toHaveLength(0);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchHelpItems(items, "zzz-no-such-term", ["title", "body"])).toHaveLength(0);
  });
});

describe("groupFaqsByCategory", () => {
  it("covers every category and every FAQ exactly once", () => {
    const groups = groupFaqsByCategory(HELP_FAQS);
    expect(groups.map((g) => g.category).sort()).toEqual([...HELP_FAQ_CATEGORIES].sort());
    const total = groups.reduce((n, g) => n + g.faqs.length, 0);
    expect(total).toBe(HELP_FAQS.length);
  });
});

describe("help content invariants", () => {
  it("has unique FAQ and glossary ids", () => {
    expect(new Set(HELP_FAQS.map((f) => f.id)).size).toBe(HELP_FAQS.length);
    expect(new Set(GLOSSARY_TERMS.map((t) => t.id)).size).toBe(GLOSSARY_TERMS.length);
  });

  it("uses only known FAQ categories", () => {
    for (const faq of HELP_FAQS) {
      expect(HELP_FAQ_CATEGORIES).toContain(faq.category);
    }
  });

  it("has a non-empty question, answer, and glossary definition everywhere", () => {
    for (const faq of HELP_FAQS) {
      expect(faq.question.trim().length).toBeGreaterThan(0);
      expect(faq.answer.trim().length).toBeGreaterThan(20);
    }
    for (const term of GLOSSARY_TERMS) {
      expect(term.term.trim().length).toBeGreaterThan(0);
      expect(term.definition.trim().length).toBeGreaterThan(20);
    }
  });

  it("never asserts a stale price, trial length, or AI provider", () => {
    // Guards the honesty rule: only $3/$18/$29, 7-day trial, OpenRouter/Groq.
    const banned = ["$9/month", "$25/month", "14-day trial", "14 day trial", "GPT-4", "GPT-4o"];
    for (const faq of HELP_FAQS) {
      for (const s of banned) {
        expect(faq.answer).not.toContain(s);
      }
    }
    expect(HELP_FAQS.some((f) => f.answer.includes("$3/month"))).toBe(true);
    expect(HELP_FAQS.some((f) => f.answer.includes("$18/month"))).toBe(true);
    expect(HELP_FAQS.some((f) => f.answer.includes("$29/month"))).toBe(true);
  });
});
