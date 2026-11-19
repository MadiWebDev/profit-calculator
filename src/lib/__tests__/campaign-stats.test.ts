import { describe, it, expect } from "vitest";
import {
  resolveDateRange,
  daysInRange,
  computeKpis,
  buildDailySeries,
  computeChannelBreakdown,
  computeTypeBreakdown,
  computePlanBreakdown,
  type CampaignStatsRow,
} from "@/lib/campaign-stats";

function row(over: Partial<CampaignStatsRow> & { stats: CampaignStatsRow["stats"] }): CampaignStatsRow {
  return {
    channel: "email",
    templateType: "announcement",
    audienceType: "all",
    audiencePlan: null,
    status: "sent",
    sentAt: new Date("2026-11-10T10:00:00Z"),
    createdAt: new Date("2026-11-09T10:00:00Z"),
    ...over,
  };
}

function stats(over: Partial<CampaignStatsRow["stats"]> = {}): CampaignStatsRow["stats"] {
  return {
    targeted: 0, sent: 0, failed: 0, skipped: 0, delivered: 0,
    opened: 0, clicked: 0, bounced: 0, complained: 0, read: 0, suppressed: 0,
    ...over,
  };
}

const NOW = new Date("2026-11-19T12:00:00Z");

describe("resolveDateRange", () => {
  it("today is a single UTC day", () => {
    const r = resolveDateRange("today", NOW);
    expect(r?.from.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });

  it("7d covers today plus the previous 6 days", () => {
    const r = resolveDateRange("7d", NOW);
    expect(r?.from.toISOString()).toBe("2026-11-13T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });

  it("this-month starts on the 1st", () => {
    const r = resolveDateRange("this-month", NOW);
    expect(r?.from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("last-month is the previous calendar month", () => {
    const r = resolveDateRange("last-month", NOW);
    expect(r?.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("all returns null (no filtering)", () => {
    expect(resolveDateRange("all", NOW)).toBeNull();
  });

  it("custom is inclusive of both days", () => {
    const r = resolveDateRange("custom", NOW, "2026-11-10", "2026-11-12");
    expect(r?.from.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });

  it("an invalid custom range falls back to 30d", () => {
    const r = resolveDateRange("custom", NOW, "2026-11-12", "2026-11-10");
    expect(r?.from.toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });
});

describe("daysInRange", () => {
  it("lists every day in a half-open range", () => {
    expect(daysInRange(new Date("2026-11-10T00:00:00Z"), new Date("2026-11-13T00:00:00Z"))).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });
});

describe("computeKpis", () => {
  it("sums rows and computes rates", () => {
    const k = computeKpis(
      [
        row({ stats: stats({ targeted: 10, sent: 8, delivered: 6, opened: 3, clicked: 1, failed: 1, skipped: 1 }) }),
        row({ channel: "whatsapp", stats: stats({ targeted: 5, sent: 4, delivered: 4, read: 2 }) }),
      ],
      2
    );
    expect(k.campaignsTotal).toBe(2);
    expect(k.campaignsSent).toBe(2);
    expect(k.targeted).toBe(15);
    expect(k.sent).toBe(12);
    expect(k.delivered).toBe(10);
    expect(k.deliveryRate).toBeCloseTo(10 / 12);
    expect(k.openRate).toBeCloseTo(3 / 10);
    expect(k.clickRate).toBeCloseTo(1 / 10);
    expect(k.readRate).toBeCloseTo(2 / 4);
    expect(k.unsubscribed).toBe(2);
  });

  it("rates are null — never 0 — when the denominator is zero", () => {
    const k = computeKpis([row({ status: "draft", sentAt: null, stats: stats() })], 0);
    expect(k.campaignsDraft).toBe(1);
    expect(k.deliveryRate).toBeNull();
    expect(k.openRate).toBeNull();
    expect(k.clickRate).toBeNull();
    expect(k.readRate).toBeNull();
  });

  it("read rate uses WhatsApp deliveries only", () => {
    const k = computeKpis(
      [
        row({ stats: stats({ sent: 10, delivered: 10 }) }),
        row({ channel: "whatsapp", stats: stats({ sent: 0, delivered: 0, read: 0 }) }),
      ],
      0
    );
    expect(k.readRate).toBeNull();
    expect(k.deliveryRate).toBeCloseTo(1);
  });
});

describe("buildDailySeries", () => {
  it("fills gaps with zeros and counts sent by current status", () => {
    const range = resolveDateRange("custom", NOW, "2026-11-10", "2026-11-12");
    const series = buildDailySeries(
      range,
      [
        { date: "2026-11-10", status: "sent", count: 5 },
        { date: "2026-11-10", status: "delivered", count: 2 },
        { date: "2026-11-10", status: "failed", count: 1 },
        { date: "2026-11-11", status: "skipped", count: 3 },
      ],
      [{ date: "2026-11-10", eventType: "delivered", count: 2 }]
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({
      date: "2026-11-10", sent: 7, delivered: 2, failed: 1,
      opened: 0, clicked: 0, read: 0, bounced: 0,
    });
    // Skipped is not a send, and the 11th has no activity at all.
    expect(series[1].sent).toBe(0);
    expect(series[2]).toEqual({
      date: "2026-11-12", sent: 0, delivered: 0, failed: 0,
      opened: 0, clicked: 0, read: 0, bounced: 0,
    });
  });

  it("returns an empty series for all-time (no bounded range)", () => {
    expect(buildDailySeries(null, [], [])).toEqual([]);
  });
});

describe("breakdowns", () => {
  const rows = [
    row({ channel: "email", templateType: "announcement", audienceType: "plan", audiencePlan: "growth", stats: stats({ targeted: 10, sent: 8, delivered: 4 }) }),
    row({ channel: "whatsapp", templateType: "announcement", audienceType: "all", stats: stats({ targeted: 5, sent: 5, delivered: 5 }) }),
    row({ channel: "email", templateType: "billing_notice", audienceType: "plan", audiencePlan: "pro", stats: stats({ targeted: 4, sent: 0, delivered: 0 }) }),
  ];

  it("channel breakdown sorts by sent desc and nulls empty rates", () => {
    const b = computeChannelBreakdown(rows);
    expect(b.map((r) => r.key)).toEqual(["email", "whatsapp"]);
    expect(b[0].sent).toBe(8);
    expect(b[0].deliveryRate).toBeCloseTo(4 / 8);
    expect(b[1].deliveryRate).toBeCloseTo(1);
  });

  it("type breakdown labels template types", () => {
    const b = computeTypeBreakdown(rows);
    expect(b.find((r) => r.key === "billing_notice")?.label).toBe("Billing notice");
    expect(b.find((r) => r.key === "announcement")?.campaigns).toBe(2);
  });

  it("plan breakdown puts non-plan audiences in a mixed bucket", () => {
    const b = computePlanBreakdown(rows);
    expect(b.map((r) => r.key)).toEqual(["growth", "mixed", "pro"]);
    expect(b.find((r) => r.key === "mixed")?.campaigns).toBe(1);
    expect(b.find((r) => r.key === "pro")?.deliveryRate).toBeNull();
  });
});
